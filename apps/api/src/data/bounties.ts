import {
  BOUNTY_EXPIRING_DAYS,
  BOUNTY_FUNDED_STATUSES,
  BOUNTY_HELD_MAX_CENTS,
  BOUNTY_KIND_RULES,
  BOUNTY_LISTED_STATUSES,
  BOUNTY_OPEN_MAX_PER_POSTER,
  type BountyEventKind,
  type BountyKind,
  type BountyStatus,
  bountyExpiresAt,
  checkPrivacy,
  CLAIM_DISPUTE_DAYS,
  CLAIM_LIVE_STATUSES,
  CLAIM_POSTER_RESPONSE_DAYS,
  CLAIMS_PER_DAY_MAX,
  claimCooldownEnds,
  type ClaimDecisionReason,
  type ClaimStatus,
  formatZar,
  normaliseCaseNumber,
  PAYOUT_ACCOUNT_HOLD_HOURS,
  payoutAccountReadyAt,
  PENDING_PAYMENT_TTL_HOURS,
  type PrivacyFindingKind,
} from '@civic/core'
import { bountyNoteSchema, createBountySchema, type CreateBountyInput, payoutAccountSchema, type PayoutAccountInput, reportBountySchema, submitClaimSchema, type SubmitClaimInput } from '@civic/core/schemas'
import { type Bounty, type BountyClaim, type BountyEvent, type Database, type LedgerEntry, type PayoutAccount, schema, type User } from '@civic/db'
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, or, type SQL, sql } from 'drizzle-orm'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { apiError } from '../errors'
import type { Payments } from '../payments'
import type { CheckoutResult, PaymentProvider, ProviderEvent, RefundStatus, TransferStatus } from '../payments/types'
import { type Connection, decodeCursor, type PageArgs, pageSize, toConnection } from './pagination'

const { bounties, bountyClaims, ledgerEntries, paymentEvents, payoutAccounts, bountyEvents, bountyReports, users, posts, likes, follows } = schema

/*
 * Every money transition is one `update ... where status = <before>` inside a
 * transaction with its ledger and audit rows, so two requests can't both move
 * the same money: the second finds no row. Provider calls (checkout, transfer,
 * refund) happen only after the transaction commits, and their results are
 * applied by idempotent `apply*` functions keyed on our reference, which the
 * webhook, the return page and the hourly sweeper all run. A crash between
 * commit and provider call leaves a PENDING ledger row the sweeper re-drives.
 */

export interface MoneyContext {
  db: Database
  payments: Payments
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const badInput = (message: string, extensions: Record<string, unknown> = {}) => apiError('BAD_USER_INPUT', message, extensions)
const notFound = (what = 'Bounty') => apiError('NOT_FOUND', `${what} not found`)
const forbidden = (message: string) => apiError('FORBIDDEN', message)

const FUNDED = [...BOUNTY_FUNDED_STATUSES]
const LISTED = [...BOUNTY_LISTED_STATUSES]
const LIVE_CLAIMS = [...CLAIM_LIVE_STATUSES]
const hours = (n: number) => n * 60 * 60_000
const days = (n: number) => hours(24 * n)

export function requireProvider(payments: Payments): PaymentProvider {
  if (!payments.provider) throw forbidden('Bounties are coming soon. Posting opens once payments go live.')
  return payments.provider
}

/* Audit trail */

interface EventInput {
  bountyId: string
  kind: BountyEventKind
  claimId?: string | null
  actorId?: string | null
  byAdmin?: boolean
  recipientId?: string | null
  isPublic?: boolean
  note?: string | null
}

async function addEvent(tx: Tx, event: EventInput): Promise<BountyEvent> {
  const [row] = await tx
    .insert(bountyEvents)
    .values({
      bountyId: event.bountyId,
      claimId: event.claimId ?? null,
      kind: event.kind,
      actorId: event.actorId ?? null,
      byAdmin: event.byAdmin ?? false,
      recipientId: event.recipientId ?? null,
      isPublic: event.isPublic ?? false,
      note: event.note ?? null,
    })
    .returning()
  return row!
}

/* Validation beyond the schemas: personal details the API refuses outright. */

const refuse = (text: string, kinds: PrivacyFindingKind[], message: string) => {
  const findings = checkPrivacy(text, 'public').filter((finding) => kinds.includes(finding.kind))
  if (findings.length) throw badInput(message, { findings: findings.map((finding) => finding.kind) })
}

function checkBountyText(kind: BountyKind, title: string, body: string) {
  const text = `${title}\n${body}`
  refuse(text, ['NATIONAL_ID', 'PAYMENT_CARD'], 'Take ID and card numbers out of the bounty.')
  if (kind === 'MISSING_PERSON') {
    refuse(text, ['STREET_ADDRESS'], 'Don’t put an address in a missing-person bounty. Say the area, not where they live.')
  }
}

function checkClaimText(kind: BountyKind, body: string) {
  refuse(body, ['NATIONAL_ID', 'PAYMENT_CARD'], 'Take ID and card numbers out of your claim.')
  // A station's phone number is welcome in a claim; an address is where the person is.
  if (kind === 'MISSING_PERSON') {
    refuse(body, ['STREET_ADDRESS'], 'Don’t tell us where the person is. Call SAPS on 10111 with the case number, then tell us which station you spoke to.')
  }
}

const issues = (error: z.ZodError) => ({ issues: z.flattenError(error).fieldErrors })

/** Whether a database error (wrapped by Drizzle, with the cause underneath) is a violation of the named constraint. */
export function violates(error: unknown, constraint: string): boolean {
  for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
    if (String((current as Error).message ?? current).includes(constraint)) return true
  }
  return false
}

/* Creating and paying for a bounty */

export async function createBounty(ctx: MoneyContext, poster: User, raw: CreateBountyInput): Promise<{ bounty: Bounty; checkoutUrl: string | null }> {
  const provider = requireProvider(ctx.payments)
  const parsed = createBountySchema.safeParse(raw)
  if (!parsed.success) throw badInput(parsed.error.issues[0]?.message ?? 'Invalid bounty', issues(parsed.error))
  const input = parsed.data
  checkBountyText(input.kind, input.title, input.body)

  const email = poster.email ?? (provider.name === 'sandbox' ? `${poster.handle}@sandbox.invalid` : null)
  if (!email) throw badInput('Your account has no email address, which the payment provider needs. Sign in with a provider that shares one.')

  if (input.postId) {
    const [post] = await ctx.db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, input.postId), eq(posts.authorId, poster.id), isNull(posts.replyToId), isNull(posts.deletedAt)))
    if (!post) throw badInput('You can only attach a bounty to your own update.')
    const [existing] = await ctx.db.select({ id: bounties.id }).from(bounties).where(and(eq(bounties.postId, input.postId), inArray(bounties.status, [...FUNDED, 'PENDING_PAYMENT'])))
    if (existing) throw badInput('That update already has a bounty.')
  }

  const [open] = await ctx.db
    .select({ n: count(), held: sql<number>`coalesce(sum(case when ${bounties.status} in ('PENDING_PAYMENT') then 0 else ${bounties.amountCents} end), 0)::int` })
    .from(bounties)
    .where(and(eq(bounties.posterId, poster.id), inArray(bounties.status, [...FUNDED, 'PENDING_PAYMENT'])))
  if ((open?.n ?? 0) >= BOUNTY_OPEN_MAX_PER_POSTER) throw badInput(`You can have ${BOUNTY_OPEN_MAX_PER_POSTER} bounties open at a time. Cancel or wait for one to close first.`)
  if ((open?.held ?? 0) + input.amountCents > BOUNTY_HELD_MAX_CENTS) {
    throw badInput(`CIVIC/ONE holds at most ${formatZar(BOUNTY_HELD_MAX_CENTS)} for one person at a time.`)
  }

  const bounty = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(bounties)
      .values({
        posterId: poster.id,
        postId: input.postId ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body,
        area: input.area || null,
        sapsCaseNumber: input.sapsCaseNumber ? normaliseCaseNumber(input.sapsCaseNumber) : null,
        relationship: input.kind === 'MISSING_PERSON' ? (input.relationship ?? null) : null,
        amountCents: input.amountCents,
        durationDays: input.durationDays,
        payerEmail: email,
        termsAcceptedAt: new Date(),
      })
      .returning()
    await tx.insert(ledgerEntries).values(depositRow(row!, poster.id, 1))
    await addEvent(tx, { bountyId: row!.id, kind: 'CREATED', actorId: poster.id })
    return row!
  })
  return { bounty, checkoutUrl: await startCheckout(ctx, bounty, email, 1) }
}

const depositRow = (bounty: Bounty, userId: string, attempt: number) => ({
  bountyId: bounty.id,
  userId,
  type: 'DEPOSIT' as const,
  amountCents: bounty.amountCents + bounty.platformFeeCents + bounty.vatCents,
  currency: bounty.currency,
  provider: 'pending',
  reference: `dep-${bounty.id}-${attempt}`,
  idempotencyKey: `deposit:${bounty.id}:${attempt}`,
})

/** Asks the provider for a checkout page. The deposit row already exists; a failure here leaves the bounty payable later. */
async function startCheckout(ctx: MoneyContext, bounty: Bounty, email: string, attempt: number): Promise<string | null> {
  const provider = requireProvider(ctx.payments)
  const reference = `dep-${bounty.id}-${attempt}`
  try {
    const session = await provider.createCheckout({
      reference,
      amountCents: bounty.amountCents + bounty.platformFeeCents + bounty.vatCents,
      currency: bounty.currency,
      email,
      callbackUrl: `${ctx.payments.siteUrl}/bounties/${bounty.id}/paid`,
      metadata: { bountyId: bounty.id },
    })
    await ctx.db.update(ledgerEntries).set({ provider: provider.name, providerRef: session.providerRef }).where(eq(ledgerEntries.reference, reference))
    return session.url
  } catch (error) {
    console.error('[bounties] checkout not started', { bounty: bounty.id, error })
    return null
  }
}

/** The poster comes back for the checkout page: because the first one failed to open, or they left it. */
export async function retryCheckout(ctx: MoneyContext, poster: User, bountyId: string): Promise<{ bounty: Bounty; checkoutUrl: string | null }> {
  const provider = requireProvider(ctx.payments)
  const bounty = await ownBounty(ctx.db, poster, bountyId)
  if (bounty.status !== 'PENDING_PAYMENT') return { bounty, checkoutUrl: null }
  const live = await liveDeposit(ctx.db, bounty.id)
  if (live) {
    // They may have paid after all; never open a second checkout for money already taken.
    const verified = await provider.verifyCheckout(live.reference)
    if (verified?.status === 'SUCCESS') return { bounty: await settleDeposit(ctx, live.reference, verified), checkoutUrl: null }
    if (verified?.status === 'PENDING' && live.provider === provider.name) {
      // Paystack keeps a reference for the first checkout; a new session needs a new one.
      await ctx.db.update(ledgerEntries).set({ status: 'FAILED', note: 'Replaced by a new checkout' }).where(eq(ledgerEntries.id, live.id))
    } else if (verified?.status === 'FAILED' || !verified) {
      await ctx.db.update(ledgerEntries).set({ status: 'FAILED', note: 'Checkout not completed' }).where(eq(ledgerEntries.id, live.id))
    }
  }
  const [prior] = await ctx.db.select({ attempts: count() }).from(ledgerEntries).where(and(eq(ledgerEntries.bountyId, bounty.id), eq(ledgerEntries.type, 'DEPOSIT')))
  const attempt = (prior?.attempts ?? 0) + 1
  await ctx.db.insert(ledgerEntries).values(depositRow(bounty, poster.id, attempt))
  return { bounty, checkoutUrl: await startCheckout(ctx, bounty, bounty.payerEmail ?? poster.email ?? `${poster.handle}@sandbox.invalid`, attempt) }
}

async function liveDeposit(db: Database | Tx, bountyId: string): Promise<LedgerEntry | null> {
  const [row] = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.bountyId, bountyId), eq(ledgerEntries.type, 'DEPOSIT'), inArray(ledgerEntries.status, ['PENDING', 'SETTLED'])))
  return row ?? null
}

/** The return page: asks the provider whether the checkout went through. The webhook may have settled it already. */
export async function confirmPayment(ctx: MoneyContext, poster: User, bountyId: string): Promise<Bounty> {
  const provider = requireProvider(ctx.payments)
  const bounty = await ownBounty(ctx.db, poster, bountyId)
  if (bounty.status !== 'PENDING_PAYMENT') return bounty
  const live = await liveDeposit(ctx.db, bounty.id)
  if (!live) return bounty
  const verified = await provider.verifyCheckout(live.reference)
  if (!verified || verified.status === 'PENDING') return bounty
  return settleDeposit(ctx, live.reference, verified)
}

/**
 * Applies a checkout result to its deposit row, once. Money only counts when
 * the provider says the exact amount and currency were paid; anything else is
 * recorded for an admin and the bounty stays unfunded.
 */
export async function settleDeposit(ctx: MoneyContext, reference: string, result: CheckoutResult): Promise<Bounty> {
  const { bounty, refund } = await ctx.db.transaction(async (tx) => {
    const [entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.reference, reference)).for('update')
    if (!entry || entry.type !== 'DEPOSIT') throw notFound('Payment')
    const [current] = await tx.select().from(bounties).where(eq(bounties.id, entry.bountyId)).for('update')
    if (!current) throw notFound()
    if (entry.status !== 'PENDING') return { bounty: current, refund: null }

    if (result.status === 'FAILED') {
      await tx.update(ledgerEntries).set({ status: 'FAILED', providerRef: result.providerRef || null, note: 'Checkout failed' }).where(eq(ledgerEntries.id, entry.id))
      return { bounty: current, refund: null }
    }
    if (result.amountCents !== entry.amountCents || result.currency !== entry.currency) {
      await tx
        .update(ledgerEntries)
        .set({ status: 'MISMATCH', providerRef: result.providerRef, note: `Provider reports ${result.currency} ${result.amountCents}, expected ${entry.currency} ${entry.amountCents}` })
        .where(eq(ledgerEntries.id, entry.id))
      await addEvent(tx, { bountyId: current.id, kind: 'FUNDED', note: 'Payment amount did not match; needs an admin', recipientId: null })
      return { bounty: current, refund: null }
    }

    await tx
      .update(ledgerEntries)
      .set({ status: 'SETTLED', providerRef: result.providerRef, providerFeeCents: result.feeCents, settledAt: new Date() })
      .where(eq(ledgerEntries.id, entry.id))
    const now = new Date()
    if (current.status === 'PENDING_PAYMENT') {
      const status: BountyStatus = current.kind === 'MISSING_PERSON' ? 'PENDING_REVIEW' : 'OPEN'
      const [updated] = await tx
        .update(bounties)
        .set({ status, depositedCents: current.depositedCents + entry.amountCents, fundedAt: now, expiresAt: bountyExpiresAt(now, current.durationDays) })
        .where(and(eq(bounties.id, current.id), eq(bounties.status, 'PENDING_PAYMENT')))
        .returning()
      await addEvent(tx, { bountyId: current.id, kind: 'FUNDED', actorId: current.posterId, isPublic: true })
      return { bounty: updated!, refund: null }
    }
    // Paid after the bounty was abandoned or cancelled: take the money in, then give it straight back.
    const [updated] = await tx
      .update(bounties)
      .set({ depositedCents: current.depositedCents + entry.amountCents })
      .where(eq(bounties.id, current.id))
      .returning()
    const lateRefund = await queueRefund(tx, updated!, entry, 'Paid after the bounty closed', null)
    return { bounty: updated!, refund: lateRefund }
  })
  if (refund) await sendRefund(ctx, refund)
  return bounty
}

/* Refunds */

/** Records a refund of everything still held. Provider call follows the commit (sendRefund). */
async function queueRefund(tx: Tx, bounty: Bounty, deposit: LedgerEntry, note: string, actorId: string | null, byAdmin = false): Promise<LedgerEntry | null> {
  const remaining = bounty.depositedCents - bounty.releasedCents - bounty.refundedCents
  if (remaining <= 0) return null
  const [prior] = await tx.select({ attempts: count() }).from(ledgerEntries).where(and(eq(ledgerEntries.bountyId, bounty.id), eq(ledgerEntries.type, 'REFUND')))
  const attempt = (prior?.attempts ?? 0) + 1
  const [row] = await tx
    .insert(ledgerEntries)
    .values({
      bountyId: bounty.id,
      userId: deposit.userId,
      type: 'REFUND',
      amountCents: remaining,
      currency: bounty.currency,
      provider: deposit.provider,
      reference: `ref-${bounty.id}-${attempt}`,
      providerRef: null,
      idempotencyKey: `refund:${bounty.id}:${deposit.id}:${attempt}`,
      note,
    })
    .returning()
  await addEvent(tx, { bountyId: bounty.id, kind: 'REFUNDED', actorId, byAdmin, recipientId: bounty.posterId, note })
  return row!
}

async function sendRefund(ctx: MoneyContext, refund: LedgerEntry): Promise<void> {
  const provider = ctx.payments.provider
  if (!provider) return
  const [deposit] = await ctx.db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.bountyId, refund.bountyId), eq(ledgerEntries.type, 'DEPOSIT'), eq(ledgerEntries.status, 'SETTLED')))
  if (!deposit?.providerRef) return
  try {
    const result = await provider.refund({ transactionRef: deposit.providerRef, amountCents: refund.amountCents, currency: refund.currency, note: refund.note ?? 'Bounty refund' })
    await applyRefund(ctx, { reference: refund.reference, status: result.status, providerRef: result.providerRef })
  } catch (error) {
    console.error('[bounties] refund not sent', { refund: refund.reference, error })
  }
}

export async function applyRefund(ctx: MoneyContext, update: { reference?: string; transactionRef?: string; status: RefundStatus; providerRef: string | null }): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    let entry: LedgerEntry | undefined
    if (update.reference) {
      ;[entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.reference, update.reference)).for('update')
    } else if (update.transactionRef) {
      // Paystack's refund events name the transaction, not our refund: the pending refund of that deposit's bounty.
      const [deposit] = await tx.select().from(ledgerEntries).where(and(eq(ledgerEntries.providerRef, update.transactionRef), eq(ledgerEntries.type, 'DEPOSIT')))
      if (deposit) {
        ;[entry] = await tx
          .select()
          .from(ledgerEntries)
          .where(and(eq(ledgerEntries.bountyId, deposit.bountyId), eq(ledgerEntries.type, 'REFUND'), eq(ledgerEntries.status, 'PENDING')))
          .orderBy(desc(ledgerEntries.createdAt))
          .for('update')
      }
    }
    if (!entry || entry.type !== 'REFUND' || entry.status !== 'PENDING') return
    if (update.status === 'PENDING') {
      if (update.providerRef) await tx.update(ledgerEntries).set({ providerRef: update.providerRef }).where(eq(ledgerEntries.id, entry.id))
      return
    }
    if (update.status === 'FAILED') {
      await tx.update(ledgerEntries).set({ status: 'FAILED', providerRef: update.providerRef ?? entry.providerRef }).where(eq(ledgerEntries.id, entry.id))
      await addEvent(tx, { bountyId: entry.bountyId, kind: 'REFUND_FAILED', note: 'The provider could not refund the deposit' })
      return
    }
    await tx.update(ledgerEntries).set({ status: 'SETTLED', providerRef: update.providerRef ?? entry.providerRef, settledAt: new Date() }).where(eq(ledgerEntries.id, entry.id))
    await tx
      .update(bounties)
      .set({ refundedCents: sql`${bounties.refundedCents} + ${entry.amountCents}` })
      .where(eq(bounties.id, entry.bountyId))
  })
}

/** Closes a funded bounty and refunds the poster, inside the caller's transaction. */
async function closeAndRefund(tx: Tx, bounty: Bounty, status: 'CANCELLED' | 'EXPIRED', kind: BountyEventKind, note: string, actorId: string | null, byAdmin = false): Promise<LedgerEntry | null> {
  const [updated] = await tx
    .update(bounties)
    .set({ status, closedAt: new Date(), winningClaimId: null })
    .where(and(eq(bounties.id, bounty.id), eq(bounties.status, bounty.status)))
    .returning()
  if (!updated) throw badInput('This bounty changed while you were looking at it. Reload and try again.')
  await addEvent(tx, { bountyId: bounty.id, kind, actorId, byAdmin, recipientId: bounty.posterId, isPublic: true, note })
  // Claims nobody decided are closed with the bounty.
  const open = await tx.select().from(bountyClaims).where(and(eq(bountyClaims.bountyId, bounty.id), inArray(bountyClaims.status, LIVE_CLAIMS)))
  for (const claim of open) {
    await tx.update(bountyClaims).set({ status: 'REJECTED', decisionReason: 'BOUNTY_CLOSED', decidedAt: new Date() }).where(eq(bountyClaims.id, claim.id))
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_REJECTED', recipientId: claim.claimantId, note: 'The bounty was closed' })
  }
  const deposit = await liveDeposit(tx, bounty.id)
  return deposit?.status === 'SETTLED' ? queueRefund(tx, updated, deposit, note, actorId, byAdmin) : null
}

/* Poster actions */

async function ownBounty(db: Database, poster: User, bountyId: string): Promise<Bounty> {
  const [bounty] = UUID.test(bountyId) ? await db.select().from(bounties).where(and(eq(bounties.id, bountyId), eq(bounties.posterId, poster.id))) : []
  if (!bounty) throw notFound()
  return bounty
}

/** Claims that keep a bounty alive: live ones, and poster rejections still inside the claimant's dispute window. */
const blockingClaims = (bountyId: string) =>
  and(
    eq(bountyClaims.bountyId, bountyId),
    or(inArray(bountyClaims.status, LIVE_CLAIMS), and(eq(bountyClaims.status, 'REJECTED_BY_POSTER'), gt(bountyClaims.rejectedAt, new Date(Date.now() - days(CLAIM_DISPUTE_DAYS))))),
  )

async function liveClaimCount(db: Database | Tx, bountyId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(bountyClaims).where(blockingClaims(bountyId))
  return row?.n ?? 0
}

export async function cancelBounty(ctx: MoneyContext, poster: User, bountyId: string): Promise<Bounty> {
  const bounty = await ownBounty(ctx.db, poster, bountyId)
  if (bounty.status === 'PENDING_PAYMENT') {
    const [updated] = await ctx.db.transaction(async (tx) => {
      const deposit = await liveDeposit(tx, bounty.id)
      if (deposit?.status === 'PENDING') await tx.update(ledgerEntries).set({ status: 'FAILED', note: 'Cancelled before payment' }).where(eq(ledgerEntries.id, deposit.id))
      await addEvent(tx, { bountyId: bounty.id, kind: 'CANCELLED', actorId: poster.id })
      return tx.update(bounties).set({ status: 'ABANDONED', closedAt: new Date() }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'PENDING_PAYMENT'))).returning()
    })
    return updated ?? bounty
  }
  if (bounty.status !== 'OPEN' && bounty.status !== 'PENDING_REVIEW') throw badInput('This bounty can’t be cancelled now.')
  if (await liveClaimCount(ctx.db, bounty.id)) {
    throw badInput('A claim is waiting for your answer. Answer it first, or ask CIVIC/ONE to cancel the bounty for you.')
  }
  const refund = await ctx.db.transaction((tx) => closeAndRefund(tx, bounty, 'CANCELLED', 'CANCELLED', 'Cancelled by the poster', poster.id))
  if (refund) await sendRefund(ctx, refund)
  return (await bountyById(ctx.db, bounty.id))!
}

export async function requestCancellation(ctx: MoneyContext, poster: User, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await ownBounty(ctx.db, poster, bountyId)
  if (!['OPEN', 'AWAITING_VERIFICATION', 'PENDING_REVIEW'].includes(bounty.status)) throw badInput('This bounty can’t be cancelled now.')
  const note = bountyNoteSchema.parse(rawNote)
  await ctx.db.transaction((tx) => addEvent(tx, { bountyId: bounty.id, kind: 'CANCEL_REQUESTED', actorId: poster.id, note }))
  return bounty
}

/* Claims */

export async function submitClaim(ctx: MoneyContext, claimant: User, bountyId: string, raw: SubmitClaimInput): Promise<BountyClaim> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || !LISTED.includes(bounty.status)) throw notFound()
  if (bounty.posterId === claimant.id) throw badInput('You can’t claim your own bounty.')
  if (bounty.status !== 'OPEN') throw badInput('New claims aren’t being accepted on this bounty right now.')
  if (bounty.expiresAt && bounty.expiresAt < new Date()) throw badInput('This bounty has expired.')
  // A thief can't open an account to claim their own bounty the same day.
  const minAge = ctx.payments.claimMinAccountAgeHours
  if (minAge > 0 && claimant.createdAt > new Date(Date.now() - hours(minAge))) {
    const wait = minAge >= 48 ? `${Math.round(minAge / 24)} days` : `${minAge} hours`
    throw badInput(`New accounts can submit claims after ${wait}. In the meantime, give what you know to SAPS on 10111.`)
  }
  const parsed = submitClaimSchema.safeParse(raw)
  if (!parsed.success) throw badInput(parsed.error.issues[0]?.message ?? 'Invalid claim', issues(parsed.error))
  checkClaimText(bounty.kind, parsed.data.body)

  const [recent] = await ctx.db
    .select({ n: count() })
    .from(bountyClaims)
    .where(and(eq(bountyClaims.claimantId, claimant.id), gt(bountyClaims.createdAt, new Date(Date.now() - days(1)))))
  if ((recent?.n ?? 0) >= CLAIMS_PER_DAY_MAX) throw badInput(`You can submit ${CLAIMS_PER_DAY_MAX} claims a day.`)

  try {
    return await ctx.db.transaction(async (tx) => {
      const [claim] = await tx
        .insert(bountyClaims)
        .values({ bountyId: bounty.id, claimantId: claimant.id, body: parsed.data.body, links: parsed.data.links.join('\n'), attestedAt: new Date() })
        .returning()
      await addEvent(tx, { bountyId: bounty.id, claimId: claim!.id, kind: 'CLAIM_SUBMITTED', actorId: claimant.id, recipientId: bounty.posterId, isPublic: true })
      return claim!
    })
  } catch (error) {
    if (violates(error, 'bounty_claims_one_live_idx')) throw badInput('You already have a claim on this bounty.')
    throw error
  }
}

async function claimById(db: Database, claimId: string): Promise<{ claim: BountyClaim; bounty: Bounty }> {
  const [row] = UUID.test(claimId)
    ? await db.select({ claim: bountyClaims, bounty: bounties }).from(bountyClaims).innerJoin(bounties, eq(bounties.id, bountyClaims.bountyId)).where(eq(bountyClaims.id, claimId))
    : []
  if (!row) throw notFound('Claim')
  return row
}

export async function withdrawClaim(ctx: MoneyContext, claimant: User, claimId: string): Promise<BountyClaim> {
  const { claim, bounty } = await claimById(ctx.db, claimId)
  if (claim.claimantId !== claimant.id) throw notFound('Claim')
  if (!['SUBMITTED', 'REJECTED_BY_POSTER', 'DISPUTED'].includes(claim.status)) throw badInput('This claim can’t be withdrawn now.')
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx.update(bountyClaims).set({ status: 'WITHDRAWN' }).where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, claim.status))).returning()
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_WITHDRAWN', actorId: claimant.id, recipientId: bounty.posterId })
    return updated!
  })
}

/** The poster says the outcome happened. The bounty stops taking claims; an admin decides after the cooling-off. */
export async function confirmClaim(ctx: MoneyContext, poster: User, claimId: string, rawNote: string | null | undefined): Promise<BountyClaim> {
  const { claim, bounty } = await claimById(ctx.db, claimId)
  if (bounty.posterId !== poster.id) throw notFound('Claim')
  if (bounty.status !== 'OPEN') throw badInput('This bounty isn’t taking decisions right now.')
  if (claim.status !== 'SUBMITTED' && claim.status !== 'DISPUTED') throw badInput('This claim has already been answered.')
  const note = rawNote ? bountyNoteSchema.parse(rawNote) : null
  const now = new Date()
  try {
    return await ctx.db.transaction(async (tx) => {
      const [updatedBounty] = await tx
        .update(bounties)
        .set({ status: 'AWAITING_VERIFICATION', winningClaimId: claim.id })
        .where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'OPEN')))
        .returning()
      if (!updatedBounty) throw badInput('This bounty changed while you were looking at it. Reload and try again.')
      const [updated] = await tx
        .update(bountyClaims)
        .set({ status: 'CONFIRMED', posterNote: note, confirmedAt: now, cooldownUntil: claimCooldownEnds(now, bounty.kind) })
        .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, claim.status)))
        .returning()
      await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_CONFIRMED', actorId: poster.id, recipientId: claim.claimantId, isPublic: true })
      return updated!
    })
  } catch (error) {
    if (violates(error, 'bounty_claims_one_winner_idx')) throw badInput('Another claim on this bounty is already confirmed.')
    throw error
  }
}

export async function rejectClaim(ctx: MoneyContext, poster: User, claimId: string, rawNote: string): Promise<BountyClaim> {
  const { claim, bounty } = await claimById(ctx.db, claimId)
  if (bounty.posterId !== poster.id) throw notFound('Claim')
  if (claim.status !== 'SUBMITTED') throw badInput('This claim has already been answered.')
  const note = bountyNoteSchema.parse(rawNote)
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bountyClaims)
      .set({ status: 'REJECTED_BY_POSTER', posterNote: note, rejectedAt: new Date() })
      .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, 'SUBMITTED')))
      .returning()
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_REJECTED_BY_POSTER', actorId: poster.id, recipientId: claim.claimantId, note })
    return updated!
  })
}

/** The claimant disagrees with a rejection: CIVIC/ONE decides, and may pay over the poster's head. */
export async function disputeClaim(ctx: MoneyContext, claimant: User, claimId: string, rawNote: string): Promise<BountyClaim> {
  const { claim, bounty } = await claimById(ctx.db, claimId)
  if (claim.claimantId !== claimant.id) throw notFound('Claim')
  if (claim.status !== 'REJECTED_BY_POSTER') throw badInput('Only a rejected claim can be disputed.')
  if (claim.rejectedAt && claim.rejectedAt.getTime() + days(CLAIM_DISPUTE_DAYS) < Date.now()) throw badInput(`A rejection can be disputed within ${CLAIM_DISPUTE_DAYS} days.`)
  const note = bountyNoteSchema.parse(rawNote)
  const now = new Date()
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bountyClaims)
      .set({ status: 'DISPUTED', disputeNote: note, disputedAt: now, cooldownUntil: claimCooldownEnds(now, bounty.kind) })
      .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, 'REJECTED_BY_POSTER')))
      .returning()
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_DISPUTED', actorId: claimant.id, recipientId: bounty.posterId, note })
    return updated!
  })
}

/* Admin decisions */

export interface ReleasePreflight {
  claimantCreatedAfterBounty: boolean
  claimantHasNoOtherActivity: boolean
  priorPairings: number
  payoutNameMismatch: boolean
  payoutAccountAgeHours: number | null
  cooldownEndsAt: string | null
}

const normaliseName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '')

/** What an admin should know before paying: cheap signals that collusion leaves behind. */
export async function releasePreflight(db: Database, bounty: Bounty, claim: BountyClaim): Promise<ReleasePreflight> {
  const [claimant] = claim.claimantId ? await db.select().from(users).where(eq(users.id, claim.claimantId)) : []
  const account = claim.claimantId ? await activePayoutAccount(db, claim.claimantId) : null
  const [activity] = claimant
    ? await db
        .select({
          n: sql<number>`(select count(*) from ${posts} where ${posts.authorId} = ${claimant.id})::int + (select count(*) from ${likes} where ${likes.userId} = ${claimant.id})::int + (select count(*) from ${follows} where ${follows.followerId} = ${claimant.id})::int`,
        })
        .from(users)
        .where(eq(users.id, claimant.id))
    : []
  const [pairings] =
    claimant && bounty.posterId
      ? await db
          .select({ n: count() })
          .from(bountyClaims)
          .innerJoin(bounties, eq(bounties.id, bountyClaims.bountyId))
          .where(and(eq(bountyClaims.claimantId, claimant.id), eq(bounties.posterId, bounty.posterId), eq(bountyClaims.status, 'PAID'), ne(bounties.id, bounty.id)))
      : []
  return {
    claimantCreatedAfterBounty: claimant ? claimant.createdAt > bounty.createdAt : false,
    claimantHasNoOtherActivity: (activity?.n ?? 0) === 0,
    priorPairings: pairings?.n ?? 0,
    payoutNameMismatch: Boolean(claimant && account && normaliseName(account.accountName) !== normaliseName(claimant.displayName)),
    payoutAccountAgeHours: account ? Math.floor((Date.now() - account.createdAt.getTime()) / hours(1)) : null,
    cooldownEndsAt: claim.cooldownUntil?.toISOString() ?? null,
  }
}

export async function decideClaim(
  ctx: MoneyContext,
  admin: User,
  claimId: string,
  decision: 'VERIFY' | 'REJECT',
  reason: ClaimDecisionReason,
  rawNote: string,
): Promise<BountyClaim> {
  const { claim, bounty } = await claimById(ctx.db, claimId)
  if (bounty.posterId === admin.id || claim.claimantId === admin.id) throw forbidden('You can’t decide a claim on a bounty you’re part of.')
  if (claim.status !== 'CONFIRMED' && claim.status !== 'DISPUTED') throw badInput('This claim isn’t waiting for a decision.')
  if (bounty.status !== 'AWAITING_VERIFICATION' && bounty.status !== 'OPEN') throw badInput('This bounty isn’t taking decisions right now.')
  const note = bountyNoteSchema.parse(rawNote)
  const now = new Date()

  if (decision === 'REJECT') {
    if (reason === 'VERIFIED' || reason === 'ADMIN_OVERRIDE') throw badInput('Choose a reason for rejecting.')
    return ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(bountyClaims)
        .set({ status: 'REJECTED', decisionReason: reason, decisionNote: note, decidedById: admin.id, decidedAt: now })
        .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, claim.status)))
        .returning()
      if (bounty.winningClaimId === claim.id) {
        // Back to taking claims, unless its time ran out while this one was under review.
        if (bounty.expiresAt && bounty.expiresAt < now) {
          await closeAndRefund(tx, { ...bounty, status: 'AWAITING_VERIFICATION' }, 'EXPIRED', 'EXPIRED', 'The bounty expired', null, true)
        } else {
          await tx.update(bounties).set({ status: 'OPEN', winningClaimId: null }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'AWAITING_VERIFICATION')))
        }
      }
      await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_REJECTED', actorId: admin.id, byAdmin: true, recipientId: claim.claimantId, note })
      return updated!
    })
  }

  if (claim.status === 'DISPUTED' && reason !== 'ADMIN_OVERRIDE') throw badInput('Paying a claim the poster rejected is an override; record it as one.')
  if (claim.cooldownUntil && claim.cooldownUntil > now) {
    throw badInput(`The cooling-off period ends ${claim.cooldownUntil.toISOString()}. Verify after that.`, { cooldownUntil: claim.cooldownUntil.toISOString() })
  }
  if (!claim.claimantId) throw badInput('The claimant deleted their account.')
  const account = await activePayoutAccount(ctx.db, claim.claimantId)
  if (!account) throw badInput('The claimant hasn’t added a payout account yet.')
  const ready = payoutAccountReadyAt(account.createdAt)
  if (ready > now) throw badInput(`The claimant’s payout account is on hold until ${ready.toISOString()}.`, { readyAt: ready.toISOString() })
  const preflight = await releasePreflight(ctx.db, bounty, claim)

  const released = await ctx.db.transaction(async (tx) => {
    const [updatedBounty] = await tx
      .update(bounties)
      .set({ status: 'RELEASING', winningClaimId: claim.id })
      .where(and(eq(bounties.id, bounty.id), inArray(bounties.status, ['AWAITING_VERIFICATION', 'OPEN'])))
      .returning()
    if (!updatedBounty) throw badInput('This bounty changed while you were looking at it. Reload and try again.')
    const [updated] = await tx
      .update(bountyClaims)
      .set({ status: 'VERIFIED', decisionReason: reason, decisionNote: note, decidedById: admin.id, decidedAt: now, preflight: JSON.stringify(preflight), payoutAccountId: account.id })
      .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, claim.status)))
      .returning()
    if (!updated) throw badInput('This claim changed while you were looking at it. Reload and try again.')
    const release = await queueRelease(tx, updatedBounty, updated, account)
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_VERIFIED', actorId: admin.id, byAdmin: true, recipientId: claim.claimantId, isPublic: true, note })
    return release
  })
  await sendTransfer(ctx, released)
  return (await claimById(ctx.db, claim.id)).claim
}

async function queueRelease(tx: Tx, bounty: Bounty, claim: BountyClaim, account: PayoutAccount): Promise<LedgerEntry> {
  const [prior] = await tx.select({ attempts: count() }).from(ledgerEntries).where(and(eq(ledgerEntries.bountyId, bounty.id), eq(ledgerEntries.type, 'RELEASE')))
  const attempt = (prior?.attempts ?? 0) + 1
  const [row] = await tx
    .insert(ledgerEntries)
    .values({
      bountyId: bounty.id,
      claimId: claim.id,
      userId: claim.claimantId,
      type: 'RELEASE',
      amountCents: bounty.amountCents,
      currency: bounty.currency,
      provider: account.provider,
      reference: `rel-${claim.id}-${attempt}`,
      idempotencyKey: `release:${claim.id}:${attempt}`,
      note: `Payout to ${account.bankName} ••••${account.accountLast4}`,
    })
    .returning()
  return row!
}

async function sendTransfer(ctx: MoneyContext, release: LedgerEntry): Promise<void> {
  const provider = ctx.payments.provider
  if (!provider || !release.claimId) return
  const [claim] = await ctx.db.select().from(bountyClaims).where(eq(bountyClaims.id, release.claimId))
  const [account] = claim?.payoutAccountId ? await ctx.db.select().from(payoutAccounts).where(eq(payoutAccounts.id, claim.payoutAccountId)) : []
  if (!account) return
  try {
    // Paystack keeps a transfer per reference; find it first so a retried step never pays twice.
    const existing = await provider.fetchTransfer(release.reference)
    const result =
      existing ??
      (await provider.transfer({ reference: release.reference, amountCents: release.amountCents, currency: release.currency, recipientCode: account.recipientCode, reason: 'CIVIC/ONE bounty' }))
    await applyTransfer(ctx, release.reference, result.status, result.providerRef)
  } catch (error) {
    console.error('[bounties] transfer not sent', { release: release.reference, error })
  }
}

/** Applies what the provider says about a payout: settled, failed, or reversed after settling. */
export async function applyTransfer(ctx: MoneyContext, reference: string, status: TransferStatus, providerRef: string | null): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const [entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.reference, reference)).for('update')
    if (!entry || entry.type !== 'RELEASE') return
    const [bounty] = await tx.select().from(bounties).where(eq(bounties.id, entry.bountyId)).for('update')
    if (!bounty) return
    if (status === 'PENDING') {
      if (providerRef && !entry.providerRef) await tx.update(ledgerEntries).set({ providerRef }).where(eq(ledgerEntries.id, entry.id))
      await addEvent(tx, { bountyId: bounty.id, claimId: entry.claimId, kind: 'PAYOUT_SENT', isPublic: true })
      return
    }
    if (status === 'SUCCESS' && entry.status === 'PENDING') {
      await tx.update(ledgerEntries).set({ status: 'SETTLED', providerRef: providerRef ?? entry.providerRef, settledAt: new Date() }).where(eq(ledgerEntries.id, entry.id))
      const [paid] = await tx
        .update(bounties)
        .set({ status: 'PAID', releasedCents: bounty.releasedCents + entry.amountCents, closedAt: new Date() })
        .where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'RELEASING')))
        .returning()
      if (!paid) return
      if (entry.claimId) await tx.update(bountyClaims).set({ status: 'PAID' }).where(eq(bountyClaims.id, entry.claimId))
      const others = await tx.select().from(bountyClaims).where(and(eq(bountyClaims.bountyId, bounty.id), inArray(bountyClaims.status, ['SUBMITTED', 'REJECTED_BY_POSTER', 'DISPUTED'])))
      for (const other of others) {
        await tx.update(bountyClaims).set({ status: 'REJECTED', decisionReason: 'OTHER_CLAIM_PAID', decidedAt: new Date() }).where(eq(bountyClaims.id, other.id))
        await addEvent(tx, { bountyId: bounty.id, claimId: other.id, kind: 'CLAIM_REJECTED', recipientId: other.claimantId, note: 'Another claim was paid' })
      }
      await addEvent(tx, { bountyId: bounty.id, claimId: entry.claimId, kind: 'PAID', recipientId: entry.userId, isPublic: true })
      await addEvent(tx, { bountyId: bounty.id, claimId: entry.claimId, kind: 'PAID', recipientId: bounty.posterId })
      return
    }
    if (status === 'FAILED' && entry.status === 'PENDING') {
      await tx.update(ledgerEntries).set({ status: 'FAILED', providerRef: providerRef ?? entry.providerRef, note: 'The bank rejected the transfer' }).where(eq(ledgerEntries.id, entry.id))
      await addEvent(tx, { bountyId: bounty.id, claimId: entry.claimId, kind: 'PAYOUT_FAILED', recipientId: entry.userId, note: 'The transfer to your bank failed. Check your payout account; CIVIC/ONE will retry.' })
      return
    }
    if (status === 'REVERSED' && entry.status === 'SETTLED') {
      // The bank sent it back after we counted it as paid: undo the payout, the bounty goes back to waiting.
      await tx.insert(ledgerEntries).values({
        bountyId: bounty.id,
        claimId: entry.claimId,
        userId: entry.userId,
        type: 'REVERSAL',
        status: 'SETTLED',
        amountCents: entry.amountCents,
        currency: entry.currency,
        provider: entry.provider,
        reference: `rev-${entry.reference}`,
        providerRef: providerRef ?? entry.providerRef,
        idempotencyKey: `reversal:${entry.id}`,
        settledAt: new Date(),
      })
      await tx.update(ledgerEntries).set({ status: 'FAILED', note: 'Reversed by the bank' }).where(eq(ledgerEntries.id, entry.id))
      await tx
        .update(bounties)
        .set({ status: 'RELEASING', releasedCents: Math.max(0, bounty.releasedCents - entry.amountCents), closedAt: null })
        .where(eq(bounties.id, bounty.id))
      if (entry.claimId) await tx.update(bountyClaims).set({ status: 'VERIFIED' }).where(eq(bountyClaims.id, entry.claimId))
      await addEvent(tx, { bountyId: bounty.id, claimId: entry.claimId, kind: 'PAYOUT_FAILED', recipientId: entry.userId, note: 'Your bank returned the payout. Check your payout account; CIVIC/ONE will retry.' })
    }
  })
}

/** After a failed or reversed payout, an admin sends it again (to the claimant's current account). */
export async function retryPayout(ctx: MoneyContext, admin: User, bountyId: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || bounty.status !== 'RELEASING' || !bounty.winningClaimId) throw badInput('There is no payout to retry on this bounty.')
  const { claim } = await claimById(ctx.db, bounty.winningClaimId)
  if (!claim.claimantId) throw badInput('The claimant deleted their account.')
  const account = await activePayoutAccount(ctx.db, claim.claimantId)
  if (!account) throw badInput('The claimant has no payout account.')
  const release = await ctx.db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.bountyId, bounty.id), eq(ledgerEntries.type, 'RELEASE'), inArray(ledgerEntries.status, ['PENDING', 'SETTLED'])))
    if (pending) return pending
    await tx.update(bountyClaims).set({ payoutAccountId: account.id }).where(eq(bountyClaims.id, claim.id))
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'PAYOUT_SENT', actorId: admin.id, byAdmin: true, note: 'Payout retried' })
    return queueRelease(tx, bounty, { ...claim, payoutAccountId: account.id }, account)
  })
  await sendTransfer(ctx, release)
  return (await bountyById(ctx.db, bounty.id))!
}

export async function approveBounty(ctx: MoneyContext, admin: User, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || bounty.status !== 'PENDING_REVIEW') throw badInput('This bounty isn’t waiting for review.')
  if (bounty.posterId === admin.id) throw forbidden('You can’t review your own bounty.')
  const note = bountyNoteSchema.parse(rawNote)
  const [updated] = await ctx.db.transaction(async (tx) => {
    await addEvent(tx, { bountyId: bounty.id, kind: 'APPROVED', actorId: admin.id, byAdmin: true, recipientId: bounty.posterId, isPublic: true, note })
    return tx.update(bounties).set({ status: 'OPEN' }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'PENDING_REVIEW'))).returning()
  })
  return updated ?? bounty
}

export async function declineBounty(ctx: MoneyContext, admin: User, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || bounty.status !== 'PENDING_REVIEW') throw badInput('This bounty isn’t waiting for review.')
  const note = bountyNoteSchema.parse(rawNote)
  const refund = await ctx.db.transaction(async (tx) => {
    await addEvent(tx, { bountyId: bounty.id, kind: 'DECLINED', actorId: admin.id, byAdmin: true, recipientId: bounty.posterId, note })
    return closeAndRefund(tx, bounty, 'CANCELLED', 'CANCELLED', 'Declined by CIVIC/ONE', admin.id, true)
  })
  if (refund) await sendRefund(ctx, refund)
  return (await bountyById(ctx.db, bounty.id))!
}

export async function adminCancelBounty(ctx: MoneyContext, admin: User, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || !['OPEN', 'AWAITING_VERIFICATION', 'PENDING_REVIEW', 'FROZEN'].includes(bounty.status)) throw badInput('This bounty can’t be cancelled now.')
  const note = bountyNoteSchema.parse(rawNote)
  const refund = await ctx.db.transaction((tx) => closeAndRefund(tx, bounty, 'CANCELLED', 'CANCELLED', note, admin.id, true))
  if (refund) await sendRefund(ctx, refund)
  return (await bountyById(ctx.db, bounty.id))!
}

export async function freezeBounty(ctx: MoneyContext, admin: User | null, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || !['OPEN', 'AWAITING_VERIFICATION', 'PENDING_REVIEW'].includes(bounty.status)) throw badInput('This bounty can’t be put on hold now.')
  const note = bountyNoteSchema.parse(rawNote)
  const [updated] = await ctx.db.transaction(async (tx) => {
    await addEvent(tx, { bountyId: bounty.id, kind: 'FROZEN', actorId: admin?.id, byAdmin: true, recipientId: bounty.posterId, note })
    return tx
      .update(bounties)
      .set({ status: 'FROZEN', frozenFromStatus: bounty.status })
      .where(and(eq(bounties.id, bounty.id), eq(bounties.status, bounty.status)))
      .returning()
  })
  return updated ?? bounty
}

export async function unfreezeBounty(ctx: MoneyContext, admin: User, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || bounty.status !== 'FROZEN' || !bounty.frozenFromStatus) throw badInput('This bounty isn’t on hold.')
  const note = bountyNoteSchema.parse(rawNote)
  // Time on hold doesn't count against the bounty (missing-person bounties still end within their cap).
  const [frozen] = await ctx.db.select().from(bountyEvents).where(and(eq(bountyEvents.bountyId, bounty.id), eq(bountyEvents.kind, 'FROZEN'))).orderBy(desc(bountyEvents.createdAt)).limit(1)
  const extendBy = frozen ? Date.now() - frozen.createdAt.getTime() : 0
  const cap = bounty.fundedAt ? bountyExpiresAt(bounty.fundedAt, BOUNTY_KIND_RULES[bounty.kind].maxDays) : null
  const extended = bounty.expiresAt ? new Date(Math.min(bounty.expiresAt.getTime() + extendBy, cap?.getTime() ?? Infinity)) : null
  const [updated] = await ctx.db.transaction(async (tx) => {
    await addEvent(tx, { bountyId: bounty.id, kind: 'UNFROZEN', actorId: admin.id, byAdmin: true, recipientId: bounty.posterId, note })
    return tx.update(bounties).set({ status: bounty.frozenFromStatus!, frozenFromStatus: null, expiresAt: extended }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'FROZEN'))).returning()
  })
  return updated ?? bounty
}

export async function reportBounty(ctx: MoneyContext, reporter: User, bountyId: string, raw: { reason: string; note?: string | null }): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || !LISTED.includes(bounty.status)) throw notFound()
  const parsed = reportBountySchema.safeParse(raw)
  if (!parsed.success) throw badInput(parsed.error.issues[0]?.message ?? 'Invalid report')
  await ctx.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(bountyReports)
      .values({ bountyId: bounty.id, reporterId: reporter.id, reason: parsed.data.reason, note: parsed.data.note ?? null })
      .onConflictDoNothing()
      .returning()
    if (inserted.length) await addEvent(tx, { bountyId: bounty.id, kind: 'REPORTED', actorId: reporter.id, note: parsed.data.reason })
  })
  return bounty
}

/* Payout accounts */

export const accountFingerprint = (key: string, bankCode: string, accountNumber: string) => createHmac('sha256', key).update(`${bankCode}:${accountNumber}`).digest('hex')

export async function activePayoutAccount(db: Database | Tx, userId: string): Promise<PayoutAccount | null> {
  const [row] = await db.select().from(payoutAccounts).where(and(eq(payoutAccounts.userId, userId), eq(payoutAccounts.status, 'ACTIVE')))
  return row ?? null
}

export async function setPayoutAccount(ctx: MoneyContext, user: User, raw: PayoutAccountInput): Promise<PayoutAccount> {
  const provider = requireProvider(ctx.payments)
  const parsed = payoutAccountSchema.safeParse(raw)
  if (!parsed.success) throw badInput(parsed.error.issues[0]?.message ?? 'Check the account details', issues(parsed.error))
  const input = parsed.data
  const bank = (await provider.listBanks()).find((candidate) => candidate.code === input.bankCode)
  if (!bank) throw badInput('Choose a bank from the list.')
  const fingerprint = accountFingerprint(ctx.payments.fingerprintKey, input.bankCode, input.accountNumber)
  const [taken] = await ctx.db.select({ userId: payoutAccounts.userId }).from(payoutAccounts).where(and(eq(payoutAccounts.fingerprint, fingerprint), eq(payoutAccounts.status, 'ACTIVE')))
  if (taken && taken.userId !== user.id) throw badInput('That bank account is already linked to another CIVIC/ONE account.')
  if (taken) return (await activePayoutAccount(ctx.db, user.id))!

  const recipient = await provider.createRecipient({ name: input.accountName, accountNumber: input.accountNumber, bankCode: input.bankCode })
  return ctx.db.transaction(async (tx) => {
    await tx.update(payoutAccounts).set({ status: 'REPLACED', replacedAt: new Date() }).where(and(eq(payoutAccounts.userId, user.id), eq(payoutAccounts.status, 'ACTIVE')))
    const [row] = await tx
      .insert(payoutAccounts)
      .values({
        userId: user.id,
        provider: provider.name,
        recipientCode: recipient.recipientCode,
        bankCode: input.bankCode,
        bankName: bank.name,
        accountName: recipient.accountName ?? input.accountName,
        accountLast4: input.accountNumber.slice(-4),
        fingerprint,
      })
      .returning()
    return row!
  })
}

/* Provider events (webhooks) */

/** Records the event first; a redelivery finds the row and does nothing. Returns what happened, for the row. */
export async function handleProviderEvent(ctx: MoneyContext, event: ProviderEvent, payload: string): Promise<string> {
  const provider = ctx.payments.provider
  if (!provider) return 'IGNORED'
  const inserted = await ctx.db
    .insert(paymentEvents)
    .values({ provider: provider.name, eventKey: event.eventKey, eventType: event.eventType, reference: 'reference' in event ? event.reference : 'transactionRef' in event ? event.transactionRef : null, payload })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id })
  if (!inserted.length) return 'DUPLICATE'
  const outcome = await applyProviderEvent(ctx, event)
  await ctx.db.update(paymentEvents).set({ outcome }).where(eq(paymentEvents.id, inserted[0]!.id))
  return outcome
}

async function applyProviderEvent(ctx: MoneyContext, event: ProviderEvent): Promise<string> {
  const provider = ctx.payments.provider!
  switch (event.type) {
    case 'CHARGE_SUCCESS': {
      const [entry] = await ctx.db.select().from(ledgerEntries).where(eq(ledgerEntries.reference, event.reference))
      if (!entry) return 'UNKNOWN_REFERENCE'
      // Never credit what the webhook body says: ask the provider.
      const verified = await provider.verifyCheckout(event.reference)
      if (!verified) return 'UNVERIFIED'
      await settleDeposit(ctx, event.reference, verified)
      return 'APPLIED'
    }
    case 'TRANSFER':
      await applyTransfer(ctx, event.reference, event.status, event.providerRef)
      return 'APPLIED'
    case 'REFUND':
      await applyRefund(ctx, { transactionRef: event.transactionRef, status: event.status, providerRef: event.providerRef })
      return 'APPLIED'
    case 'CHARGEBACK':
      return applyChargeback(ctx, event.transactionRef, event.status)
    default:
      return 'IGNORED'
  }
}

/** A card dispute: nothing moves until it's resolved, and the poster's bounty is hidden. */
async function applyChargeback(ctx: MoneyContext, transactionRef: string, status: 'CREATED' | 'RESOLVED'): Promise<string> {
  const [deposit] = await ctx.db.select().from(ledgerEntries).where(and(eq(ledgerEntries.providerRef, transactionRef), eq(ledgerEntries.type, 'DEPOSIT')))
  if (!deposit) return 'UNKNOWN_REFERENCE'
  const bounty = await bountyById(ctx.db, deposit.bountyId)
  if (!bounty) return 'UNKNOWN_REFERENCE'
  await ctx.db.transaction(async (tx) => {
    await tx
      .insert(ledgerEntries)
      .values({
        bountyId: bounty.id,
        userId: deposit.userId,
        type: status === 'CREATED' ? 'CHARGEBACK' : 'CHARGEBACK_REVERSED',
        status: 'SETTLED',
        amountCents: deposit.amountCents,
        currency: deposit.currency,
        provider: deposit.provider,
        reference: `cbk-${deposit.reference}-${status === 'CREATED' ? 'open' : 'closed'}`,
        providerRef: transactionRef,
        idempotencyKey: `chargeback:${deposit.id}:${status}`,
        settledAt: new Date(),
      })
      .onConflictDoNothing()
    await addEvent(tx, { bountyId: bounty.id, kind: 'CHARGEBACK', note: status === 'CREATED' ? 'The poster’s bank opened a dispute over the payment' : 'The dispute was resolved' })
    if (status === 'CREATED' && ['OPEN', 'AWAITING_VERIFICATION', 'PENDING_REVIEW'].includes(bounty.status)) {
      await tx.update(bounties).set({ status: 'FROZEN', frozenFromStatus: bounty.status }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, bounty.status)))
    }
  })
  return 'APPLIED'
}

/* The hourly sweep */

export interface SweepReport {
  abandoned: number
  expired: number
  expiring: number
  escalated: number
  redriven: number
}

export async function sweep(ctx: MoneyContext): Promise<SweepReport> {
  const now = new Date()
  const report: SweepReport = { abandoned: 0, expired: 0, expiring: 0, escalated: 0, redriven: 0 }

  // Checkouts nobody completed.
  const stale = await ctx.db.select().from(bounties).where(and(eq(bounties.status, 'PENDING_PAYMENT'), lt(bounties.createdAt, new Date(now.getTime() - hours(PENDING_PAYMENT_TTL_HOURS)))))
  for (const bounty of stale) {
    const [updated] = await ctx.db.transaction(async (tx) => {
      const deposit = await liveDeposit(tx, bounty.id)
      if (deposit?.status === 'PENDING') await tx.update(ledgerEntries).set({ status: 'FAILED', note: 'Checkout not completed' }).where(eq(ledgerEntries.id, deposit.id))
      return tx.update(bounties).set({ status: 'ABANDONED', closedAt: now }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'PENDING_PAYMENT'))).returning()
    })
    if (updated) report.abandoned++
  }

  // Open bounties past their date. Ones with a claim still being answered or disputable wait.
  const dueBounties = await ctx.db.select().from(bounties).where(and(eq(bounties.status, 'OPEN'), lt(bounties.expiresAt, now)))
  for (const bounty of dueBounties) {
    if (await liveClaimCount(ctx.db, bounty.id)) continue
    const refund = await ctx.db.transaction((tx) => closeAndRefund(tx, bounty, 'EXPIRED', 'EXPIRED', 'The bounty ran out of time', null))
    if (refund) await sendRefund(ctx, refund)
    report.expired++
  }

  // A reminder a few days before expiry.
  const soon = await ctx.db
    .select()
    .from(bounties)
    .where(and(eq(bounties.status, 'OPEN'), isNull(bounties.expiringNotifiedAt), lt(bounties.expiresAt, new Date(now.getTime() + days(BOUNTY_EXPIRING_DAYS)))))
  for (const bounty of soon) {
    await ctx.db.transaction(async (tx) => {
      await addEvent(tx, { bountyId: bounty.id, kind: 'EXPIRING', recipientId: bounty.posterId, note: `Expires ${bounty.expiresAt?.toISOString() ?? ''}` })
      await tx.update(bounties).set({ expiringNotifiedAt: now }).where(eq(bounties.id, bounty.id))
    })
    report.expiring++
  }

  // Claims the poster hasn't answered go to an admin.
  const silent = await ctx.db
    .select({ claim: bountyClaims, bounty: bounties })
    .from(bountyClaims)
    .innerJoin(bounties, eq(bounties.id, bountyClaims.bountyId))
    .where(and(eq(bountyClaims.status, 'SUBMITTED'), eq(bounties.status, 'OPEN'), lt(bountyClaims.createdAt, new Date(now.getTime() - days(CLAIM_POSTER_RESPONSE_DAYS)))))
  for (const { claim, bounty } of silent) {
    await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(bountyClaims)
        .set({ status: 'DISPUTED', disputedAt: now, cooldownUntil: claimCooldownEnds(now, bounty.kind), disputeNote: `The poster didn’t answer within ${CLAIM_POSTER_RESPONSE_DAYS} days` })
        .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, 'SUBMITTED')))
        .returning()
      if (updated) await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_ESCALATED', recipientId: claim.claimantId, note: 'The poster didn’t answer, so CIVIC/ONE will decide' })
    })
    report.escalated++
  }

  // Money the provider was asked to move but never confirmed: ask again.
  const provider = ctx.payments.provider
  if (provider) {
    const pending = await ctx.db.select().from(ledgerEntries).where(and(eq(ledgerEntries.status, 'PENDING'), lt(ledgerEntries.createdAt, new Date(now.getTime() - hours(1)))))
    for (const entry of pending) {
      try {
        if (entry.type === 'DEPOSIT') {
          const verified = await provider.verifyCheckout(entry.reference)
          if (verified && verified.status !== 'PENDING') await settleDeposit(ctx, entry.reference, verified)
        } else if (entry.type === 'RELEASE') {
          await sendTransfer(ctx, entry)
        } else if (entry.type === 'REFUND' && !entry.providerRef) {
          await sendRefund(ctx, entry)
        }
        report.redriven++
      } catch (error) {
        console.error('[bounties] sweep could not re-drive', { reference: entry.reference, error })
      }
    }
  }
  return report
}

/* Reading */

export async function bountyById(db: Database, id: string): Promise<Bounty | null> {
  if (!UUID.test(id)) return null
  const [row] = await db.select().from(bounties).where(eq(bounties.id, id))
  return row ?? null
}

/** Whether someone may open this bounty's page. */
export function canSeeBounty(bounty: Bounty, viewer: User | null, isAdmin: boolean, hasClaim: boolean): boolean {
  if (isAdmin) return true
  if (viewer && bounty.posterId === viewer.id) return true
  if (LISTED.includes(bounty.status) || bounty.status === 'CANCELLED' || bounty.status === 'EXPIRED') return true
  return hasClaim
}

const boardOrder = (cursor: { createdAt: string; id: string } | null): SQL | undefined =>
  cursor ? sql`(${bounties.createdAt}, ${bounties.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined

async function pageBounties(db: Database, where: SQL | undefined, args: PageArgs): Promise<Connection<Bounty>> {
  const limit = pageSize(args)
  const cursor = args.after ? decodeCursor(args.after) : null
  const rows = await db
    .select()
    .from(bounties)
    .where(and(where, boardOrder(cursor)))
    .orderBy(desc(bounties.createdAt), desc(bounties.id))
    .limit(limit + 1)
  return toConnection(rows, limit, cursor !== null)
}

/** The public board: open bounties (and ones being paid), or the honoured ones. Expired-but-unswept ones stay off it. */
export function pageBoard(db: Database, { kind, honoured }: { kind?: BountyKind | null; honoured?: boolean | null }, args: PageArgs) {
  const live = honoured ? eq(bounties.status, 'PAID') : and(inArray(bounties.status, ['OPEN', 'AWAITING_VERIFICATION', 'RELEASING']), or(ne(bounties.status, 'OPEN'), gt(bounties.expiresAt, new Date())))
  return pageBounties(db, and(live, kind ? eq(bounties.kind, kind) : undefined), args)
}

export const pageMyBounties = (db: Database, posterId: string, args: PageArgs) => pageBounties(db, eq(bounties.posterId, posterId), args)

/** A profile's bounties: what's on the board, plus everything to its owner. */
export const pageUserBounties = (db: Database, userId: string, own: boolean, args: PageArgs) =>
  pageBounties(db, and(eq(bounties.posterId, userId), own ? undefined : inArray(bounties.status, LISTED)), args)

export async function countUserBounties(db: Database, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(bounties).where(and(eq(bounties.posterId, userId), inArray(bounties.status, LISTED)))
  return row?.n ?? 0
}

export async function pageMyClaims(db: Database, claimantId: string, args: PageArgs): Promise<Connection<BountyClaim>> {
  const limit = pageSize(args)
  const cursor = args.after ? decodeCursor(args.after) : null
  const rows = await db
    .select()
    .from(bountyClaims)
    .where(and(eq(bountyClaims.claimantId, claimantId), cursor ? sql`(${bountyClaims.createdAt}, ${bountyClaims.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined))
    .orderBy(desc(bountyClaims.createdAt), desc(bountyClaims.id))
    .limit(limit + 1)
  return toConnection(rows, limit, cursor !== null)
}

/** Everything an admin should look at: reviews, confirmed claims, disputes, failed payouts, holds, reports, cancellation requests. */
export function pageAdminQueue(db: Database, args: PageArgs) {
  const disputed = db.select({ id: bountyClaims.bountyId }).from(bountyClaims).where(eq(bountyClaims.status, 'DISPUTED'))
  const reported = db.select({ id: bountyReports.bountyId }).from(bountyReports)
  const failed = db.select({ id: ledgerEntries.bountyId }).from(ledgerEntries).where(and(eq(ledgerEntries.type, 'RELEASE'), eq(ledgerEntries.status, 'FAILED')))
  const mismatched = db.select({ id: ledgerEntries.bountyId }).from(ledgerEntries).where(eq(ledgerEntries.status, 'MISMATCH'))
  const cancelRequested = db.select({ id: bountyEvents.bountyId }).from(bountyEvents).where(eq(bountyEvents.kind, 'CANCEL_REQUESTED'))
  return pageBounties(
    db,
    and(
      inArray(bounties.status, [...FUNDED, 'PENDING_PAYMENT']),
      or(
        inArray(bounties.status, ['PENDING_REVIEW', 'AWAITING_VERIFICATION', 'RELEASING', 'FROZEN']),
        inArray(bounties.id, disputed),
        inArray(bounties.id, reported),
        inArray(bounties.id, failed),
        inArray(bounties.id, mismatched),
        inArray(bounties.id, cancelRequested),
      ),
    ),
    args,
  )
}

export const claimsFor = (db: Database, bountyId: string) => db.select().from(bountyClaims).where(eq(bountyClaims.bountyId, bountyId)).orderBy(asc(bountyClaims.createdAt))

export async function viewerClaim(db: Database, bountyId: string, viewerId: string): Promise<BountyClaim | null> {
  const [row] = await db
    .select()
    .from(bountyClaims)
    .where(and(eq(bountyClaims.bountyId, bountyId), eq(bountyClaims.claimantId, viewerId)))
    .orderBy(desc(bountyClaims.createdAt))
    .limit(1)
  return row ?? null
}

export const eventsFor = (db: Database, bountyId: string, all: boolean) =>
  db
    .select()
    .from(bountyEvents)
    .where(and(eq(bountyEvents.bountyId, bountyId), all ? undefined : eq(bountyEvents.isPublic, true)))
    .orderBy(asc(bountyEvents.createdAt))

export const reportsFor = (db: Database, bountyId: string) => db.select().from(bountyReports).where(eq(bountyReports.bountyId, bountyId)).orderBy(asc(bountyReports.createdAt))

export const ledgerFor = (db: Database, bountyId: string) => db.select().from(ledgerEntries).where(eq(ledgerEntries.bountyId, bountyId)).orderBy(asc(ledgerEntries.createdAt))

export const latestReleaseFor = async (db: Database, bountyId: string): Promise<LedgerEntry | null> => {
  const [row] = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.bountyId, bountyId), eq(ledgerEntries.type, 'RELEASE')))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(1)
  return row ?? null
}

/** Bounties that stop an account being deleted: money is held for or owed to it. */
export async function heldForUser(db: Database, userId: string): Promise<string[]> {
  const posted = db.select({ id: bounties.id }).from(bounties).where(and(eq(bounties.posterId, userId), inArray(bounties.status, FUNDED)))
  const claimed = db
    .select({ id: bountyClaims.bountyId })
    .from(bountyClaims)
    .where(and(eq(bountyClaims.claimantId, userId), inArray(bountyClaims.status, ['CONFIRMED', 'DISPUTED', 'VERIFIED'])))
  // A deposit nobody paid for doesn't hold money; deletion abandons it.
  const pending = db.select({ id: ledgerEntries.bountyId }).from(ledgerEntries).where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.status, 'PENDING'), ne(ledgerEntries.type, 'DEPOSIT')))
  const rows = await db
    .select({ id: bounties.id })
    .from(bounties)
    .where(or(inArray(bounties.id, posted), inArray(bounties.id, claimed), inArray(bounties.id, pending)))
  return rows.map((row) => row.id)
}

export const CLAIM_POSTER_RESPONSE = { days: CLAIM_POSTER_RESPONSE_DAYS, holdHours: PAYOUT_ACCOUNT_HOLD_HOURS, kinds: BOUNTY_KIND_RULES }
export type { ClaimStatus }
