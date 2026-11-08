import {
  BOUNTY_CLOSED_STATUSES,
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
  CLAIM_DECISION_LABEL,
  CLAIM_LIVE_STATUSES,
  CLAIM_POSTER_RESPONSE_DAYS,
  CLAIM_TEXT_RETENTION_DAYS,
  CLAIMS_PER_DAY_MAX,
  claimCooldownEnds,
  type ClaimDecisionReason,
  type ClaimStatus,
  formatZar,
  MISSING_PERSON_TEXT_RETENTION_DAYS,
  normaliseCaseNumber,
  payoutAccountReadyAt,
  PENDING_PAYMENT_TTL_HOURS,
  posterAnswerDue,
  type PrivacyFindingKind,
} from '@civic/core'
import { bountyNoteSchema, createBountySchema, type CreateBountyInput, payoutAccountSchema, type PayoutAccountInput, reportBountySchema, submitClaimSchema, type SubmitClaimInput } from '@civic/core/schemas'
import { type Bounty, type BountyClaim, type BountyEvent, type Database, type LedgerEntry, type PayoutAccount, schema, type User } from '@civic/db'
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, or, type SQL, sql } from 'drizzle-orm'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { apiError } from '../errors'
import type { Payments } from '../payments'
import { type CheckoutResult, type PaymentProvider, PaymentProviderError, type ProviderEvent, type RefundStatus, type TransferResult, type TransferStatus } from '../payments/types'
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
  /** Handles of the admins who review claims, so they can be told when one needs them. */
  adminHandles?: ReadonlySet<string>
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const badInput = (message: string, extensions: Record<string, unknown> = {}) => apiError('BAD_USER_INPUT', message, extensions)
const notFound = (what = 'Bounty') => apiError('NOT_FOUND', `${what} not found`)
const forbidden = (message: string) => apiError('FORBIDDEN', message)

const FUNDED = [...BOUNTY_FUNDED_STATUSES]
const LISTED = [...BOUNTY_LISTED_STATUSES]
const CLOSED = [...BOUNTY_CLOSED_STATUSES]
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

/** Tells every admin that a bounty needs them: a claim to check, a confirmation, an objection. */
async function notifyAdmins(tx: Tx, ctx: MoneyContext, event: { bountyId: string; claimId: string; note: string }): Promise<void> {
  const handles = [...(ctx.adminHandles ?? [])]
  if (!handles.length) return
  const admins = await tx.select({ id: users.id }).from(users).where(inArray(users.handle, handles))
  for (const admin of admins) await addEvent(tx, { ...event, kind: 'REVIEW_NEEDED', recipientId: admin.id })
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

  const bounty = await ctx.db.transaction(async (tx) => {
    // The caps are checked and the row written under one lock on the poster, so two requests can't both squeeze under them.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, poster.id)).for('update')
    if (input.postId) {
      const [post] = await tx.select({ id: posts.id }).from(posts).where(and(eq(posts.id, input.postId), eq(posts.authorId, poster.id), isNull(posts.replyToId), isNull(posts.deletedAt)))
      if (!post) throw badInput('You can only attach a bounty to your own update.')
      const [existing] = await tx.select({ id: bounties.id }).from(bounties).where(and(eq(bounties.postId, input.postId), inArray(bounties.status, [...FUNDED, 'PENDING_PAYMENT'])))
      if (existing) throw badInput('That update already has a bounty.')
    }
    // Unpaid bounties count towards both caps: they can all be paid for a moment later.
    const [open] = await tx
      .select({ n: count(), held: sql<number>`coalesce(sum(${bounties.amountCents}), 0)::int` })
      .from(bounties)
      .where(and(eq(bounties.posterId, poster.id), inArray(bounties.status, [...FUNDED, 'PENDING_PAYMENT'])))
    if ((open?.n ?? 0) >= BOUNTY_OPEN_MAX_PER_POSTER) throw badInput(`You can have ${BOUNTY_OPEN_MAX_PER_POSTER} bounties open at a time. Cancel or wait for one to close first.`)
    if ((open?.held ?? 0) + input.amountCents > BOUNTY_HELD_MAX_CENTS) {
      throw badInput(`CIVIC/ONE holds at most ${formatZar(BOUNTY_HELD_MAX_CENTS)} for one person at a time, counting bounties not paid for yet.`)
    }

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
    // Not paid (or never seen by the provider): close this checkout and open a fresh one. The old page may still be
    // payable; a payment there lands on its own reference, and settleDeposit takes a late one in.
    const [closed] = await ctx.db
      .update(ledgerEntries)
      .set({ status: 'FAILED', note: verified ? 'Replaced by a new checkout' : 'Checkout not completed' })
      .where(and(eq(ledgerEntries.id, live.id), eq(ledgerEntries.status, 'PENDING')))
      .returning({ id: ledgerEntries.id })
    // It settled while the provider was being asked: there is nothing left to pay for.
    if (!closed) return { bounty: (await bountyById(ctx.db, bounty.id)) ?? bounty, checkoutUrl: null }
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
 * recorded for an admin and the bounty stays unfunded. A payment that lands on
 * a checkout already written off (replaced, timed out, deleted) is taken in
 * too: it funds the bounty if that is still possible, and goes straight back
 * to the card otherwise.
 */
export async function settleDeposit(ctx: MoneyContext, reference: string, result: CheckoutResult): Promise<Bounty> {
  const { bounty, refund } = await ctx.db.transaction(async (tx) => {
    const [entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.reference, reference)).for('update')
    if (!entry || entry.type !== 'DEPOSIT') throw notFound('Payment')
    const [current] = await tx.select().from(bounties).where(eq(bounties.id, entry.bountyId)).for('update')
    if (!current) throw notFound()
    const unchanged = { bounty: current, refund: null }
    // Counted already, or already in front of an admin; a written-off row with a settlement date was taken in and refunded.
    if (entry.status === 'SETTLED' || entry.status === 'MISMATCH' || entry.settledAt) return unchanged
    if (result.status === 'PENDING') return unchanged
    if (result.status === 'FAILED') {
      if (entry.status === 'PENDING') await tx.update(ledgerEntries).set({ status: 'FAILED', providerRef: result.providerRef || null, note: 'Checkout failed' }).where(eq(ledgerEntries.id, entry.id))
      return unchanged
    }
    if (result.amountCents !== entry.amountCents || result.currency !== entry.currency) {
      await tx
        .update(ledgerEntries)
        .set({ status: 'MISMATCH', providerRef: result.providerRef, note: `Provider reports ${result.currency} ${result.amountCents}, expected ${entry.currency} ${entry.amountCents}` })
        .where(eq(ledgerEntries.id, entry.id))
      await addEvent(tx, { bountyId: current.id, kind: 'FUNDED', note: 'Payment amount did not match; needs an admin', recipientId: null })
      return unchanged
    }

    const now = new Date()
    const late = entry.status === 'FAILED'
    // Money on a checkout that was written off: another checkout for the same bounty may be open, or already paid.
    const other = late ? await liveDeposit(tx, current.id) : null
    if (other?.status === 'PENDING') {
      await tx.update(ledgerEntries).set({ status: 'FAILED', note: 'Replaced: an earlier checkout was paid' }).where(and(eq(ledgerEntries.id, other.id), eq(ledgerEntries.status, 'PENDING')))
    }
    const paidTwice = other?.status === 'SETTLED'
    await tx
      .update(ledgerEntries)
      .set({
        // One live deposit per bounty is a database rule: a second payment stays a written-off row, dated, with its refund beside it.
        status: paidTwice ? 'FAILED' : 'SETTLED',
        providerRef: result.providerRef,
        providerFeeCents: result.feeCents,
        settledAt: now,
        note: paidTwice ? 'Paid after this checkout was replaced; refunded in full' : late ? 'Paid after this checkout was written off' : entry.note,
      })
      .where(eq(ledgerEntries.id, entry.id))

    if (current.status === 'PENDING_PAYMENT' && !paidTwice) {
      const status: BountyStatus = current.kind === 'MISSING_PERSON' ? 'PENDING_REVIEW' : 'OPEN'
      const [updated] = await tx
        .update(bounties)
        .set({ status, depositedCents: current.depositedCents + entry.amountCents, fundedAt: now, expiresAt: bountyExpiresAt(now, current.durationDays), listedAt: status === 'OPEN' ? now : null })
        .where(and(eq(bounties.id, current.id), eq(bounties.status, 'PENDING_PAYMENT')))
        .returning()
      await addEvent(tx, { bountyId: current.id, kind: 'FUNDED', actorId: current.posterId, isPublic: true })
      return { bounty: updated!, refund: null }
    }
    // Paid after the bounty closed, or paid twice: take the money in, then give it straight back.
    const [updated] = await tx
      .update(bounties)
      .set({ depositedCents: current.depositedCents + entry.amountCents })
      .where(eq(bounties.id, current.id))
      .returning()
    const lateRefund = await queueRefund(tx, updated!, entry, paidTwice ? 'Paid twice; the second payment goes back' : 'Paid after the bounty closed', null, false, entry.amountCents)
    return { bounty: updated!, refund: lateRefund }
  })
  if (refund) await sendRefund(ctx, refund)
  return bounty
}

/* Refunds */

/**
 * Records a refund of everything still held (or of `amountCents`). The provider
 * call follows the commit (sendRefund). The key names the deposit being given
 * back, so the provider is asked to refund that transaction and no other.
 */
async function queueRefund(tx: Tx, bounty: Bounty, deposit: LedgerEntry, note: string, actorId: string | null, byAdmin = false, amountCents?: number): Promise<LedgerEntry | null> {
  const [queued] = await tx
    .select({ n: sql<number>`coalesce(sum(${ledgerEntries.amountCents}), 0)::int` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.bountyId, bounty.id), eq(ledgerEntries.type, 'REFUND'), eq(ledgerEntries.status, 'PENDING')))
  const remaining = amountCents ?? bounty.depositedCents - bounty.releasedCents - bounty.refundedCents - (queued?.n ?? 0)
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

/** The deposit a refund gives back, named in its key (`refund:<bounty>:<deposit>:<n>`). */
async function refundedDeposit(db: Database | Tx, refund: LedgerEntry): Promise<LedgerEntry | null> {
  const depositId = refund.idempotencyKey.split(':')[2] ?? ''
  const [row] = UUID.test(depositId) ? await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, depositId)) : []
  return row ?? null
}

async function sendRefund(ctx: MoneyContext, refund: LedgerEntry): Promise<void> {
  const provider = ctx.payments.provider
  if (!provider) return
  const deposit = await refundedDeposit(ctx.db, refund)
  if (!deposit?.providerRef) {
    console.error('[bounties] refund has no transaction to go back to', { refund: refund.reference })
    return
  }
  try {
    const result = await provider.refund({ transactionRef: deposit.providerRef, amountCents: refund.amountCents, currency: refund.currency, note: refund.note ?? 'Bounty refund' })
    await applyRefund(ctx, { reference: refund.reference, status: result.status, providerRef: result.providerRef })
  } catch (error) {
    console.error('[bounties] refund not sent', { refund: refund.reference, error })
  }
}

/** A deposit by our reference (what Paystack's refund and dispute events carry) or by the provider's transaction id. */
async function depositByRef(db: Database | Tx, ref: string): Promise<LedgerEntry | null> {
  if (!ref) return null
  const [row] = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.type, 'DEPOSIT'), or(eq(ledgerEntries.reference, ref), eq(ledgerEntries.providerRef, ref))))
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(1)
  return row ?? null
}

export async function applyRefund(ctx: MoneyContext, update: { reference?: string; transactionRef?: string; status: RefundStatus; providerRef: string | null }): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    let entry: LedgerEntry | undefined
    if (update.reference) {
      ;[entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.reference, update.reference)).for('update')
    } else if (update.transactionRef) {
      // Paystack's refund events name the transaction, not our refund: the pending refund of that deposit.
      const deposit = await depositByRef(tx, update.transactionRef)
      if (deposit) {
        ;[entry] = await tx
          .select()
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.bountyId, deposit.bountyId),
              eq(ledgerEntries.type, 'REFUND'),
              eq(ledgerEntries.status, 'PENDING'),
              sql`${ledgerEntries.idempotencyKey} like ${`refund:${deposit.bountyId}:${deposit.id}:%`}`,
            ),
          )
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
      // The poster is owed money until an admin sends it again (retryRefund); both hear about it.
      await addEvent(tx, { bountyId: entry.bountyId, kind: 'REFUND_FAILED', recipientId: entry.userId, note: 'The refund to your card didn’t go through. CIVIC/ONE is looking at it and will send it again.' })
      return
    }
    await tx.update(ledgerEntries).set({ status: 'SETTLED', providerRef: update.providerRef ?? entry.providerRef, settledAt: new Date() }).where(eq(ledgerEntries.id, entry.id))
    await tx
      .update(bounties)
      .set({ refundedCents: sql`${bounties.refundedCents} + ${entry.amountCents}` })
      .where(eq(bounties.id, entry.bountyId))
  })
}

/** Claims nobody decided are closed with the bounty. */
async function closeLiveClaims(tx: Tx, bountyId: string, note: string): Promise<void> {
  const open = await tx.select().from(bountyClaims).where(and(eq(bountyClaims.bountyId, bountyId), inArray(bountyClaims.status, LIVE_CLAIMS)))
  for (const claim of open) {
    await tx.update(bountyClaims).set({ status: 'REJECTED', decisionReason: 'BOUNTY_CLOSED', decidedAt: new Date() }).where(eq(bountyClaims.id, claim.id))
    await addEvent(tx, { bountyId, claimId: claim.id, kind: 'CLAIM_REJECTED', recipientId: claim.claimantId, note })
  }
}

/** Closes a funded bounty and refunds the poster, inside the caller's transaction. */
async function closeAndRefund(tx: Tx, bounty: Bounty, status: 'CANCELLED' | 'EXPIRED', kind: BountyEventKind, note: string, actorId: string | null, byAdmin = false): Promise<LedgerEntry | null> {
  const [updated] = await tx
    .update(bounties)
    .set({ status, closedAt: new Date(), winningClaimId: null, frozenFromStatus: null })
    .where(and(eq(bounties.id, bounty.id), eq(bounties.status, bounty.status)))
    .returning()
  if (!updated) throw badInput('This bounty changed while you were looking at it. Reload and try again.')
  await addEvent(tx, { bountyId: bounty.id, kind, actorId, byAdmin, recipientId: bounty.posterId, isPublic: true, note })
  await closeLiveClaims(tx, bounty.id, 'The bounty was closed')
  if (updated.depositedCents - updated.releasedCents - updated.refundedCents <= 0) return null
  const deposit = await liveDeposit(tx, bounty.id)
  // Money is held but no settled deposit says where it came from: never close quietly over it.
  if (deposit?.status !== 'SETTLED') throw new Error(`Bounty ${bounty.id} holds money with no settled deposit`)
  return queueRefund(tx, updated, deposit, note, actorId, byAdmin)
}

/* Poster actions */

async function ownBounty(db: Database, poster: User, bountyId: string): Promise<Bounty> {
  const [bounty] = UUID.test(bountyId) ? await db.select().from(bounties).where(and(eq(bounties.id, bountyId), eq(bounties.posterId, poster.id))) : []
  if (!bounty) throw notFound()
  return bounty
}

/** Admin actions never touch an admin's own bounty, or one they claimed: the second pair of eyes has to be someone else's. */
async function notParty(db: Database, admin: User, bounty: Bounty, message = 'You can’t act on a bounty you’re part of.'): Promise<void> {
  if (bounty.posterId === admin.id || (await viewerClaim(db, bounty.id, admin.id))) throw forbidden(message)
}

/** Claims that keep a bounty alive, from the moment one is sent until it is paid, rejected or withdrawn. */
async function liveClaimCount(db: Database | Tx, bountyId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(bountyClaims)
    .where(and(eq(bountyClaims.bountyId, bountyId), inArray(bountyClaims.status, LIVE_CLAIMS)))
  return row?.n ?? 0
}

export async function cancelBounty(ctx: MoneyContext, poster: User, bountyId: string): Promise<Bounty> {
  const bounty = await ownBounty(ctx.db, poster, bountyId)
  if (bounty.status === 'PENDING_PAYMENT') {
    const [updated] = await ctx.db.transaction(async (tx) => {
      const deposit = await liveDeposit(tx, bounty.id)
      if (deposit?.status === 'PENDING') {
        await tx.update(ledgerEntries).set({ status: 'FAILED', note: 'Cancelled before payment' }).where(and(eq(ledgerEntries.id, deposit.id), eq(ledgerEntries.status, 'PENDING')))
      }
      const rows = await tx.update(bounties).set({ status: 'ABANDONED', closedAt: new Date() }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'PENDING_PAYMENT'))).returning()
      if (rows.length) await addEvent(tx, { bountyId: bounty.id, kind: 'CANCELLED', actorId: poster.id })
      return rows
    })
    // No row means the payment settled in the meantime: the bounty is funded, not deleted.
    return updated ?? (await bountyById(ctx.db, bounty.id)) ?? bounty
  }
  if (bounty.status !== 'OPEN' && bounty.status !== 'PENDING_REVIEW') throw badInput('This bounty can’t be cancelled now.')
  if (await liveClaimCount(ctx.db, bounty.id)) {
    throw badInput('A claim on this bounty is being decided, so it can’t be cancelled now. Ask CIVIC/ONE to cancel it for you.')
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
  // One claim per person per bounty, ever: withdrawing and claiming again would keep a bounty from closing for as long as someone liked.
  const [earlier] = await ctx.db.select({ status: bountyClaims.status }).from(bountyClaims).where(and(eq(bountyClaims.bountyId, bounty.id), eq(bountyClaims.claimantId, claimant.id))).limit(1)
  if (earlier) throw badInput(earlier.status === 'WITHDRAWN' ? 'You withdrew your claim on this bounty, and a bounty can be claimed once.' : 'You already have a claim on this bounty.')
  // A claim is a claim on money: it needs somewhere for the money to go. The 72-hour hold on a new account still applies at payout.
  if (!(await activePayoutAccount(ctx.db, claimant.id))) {
    throw badInput('Add the bank account the reward should be paid into before you claim. You can do it under Payouts in Settings.', { needsPayoutAccount: true })
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
      // The poster is told a claim came in, never by whom or what it says: that waits for CIVIC/ONE's check.
      await addEvent(tx, { bountyId: bounty.id, claimId: claim!.id, kind: 'CLAIM_SUBMITTED', actorId: claimant.id, recipientId: bounty.posterId, isPublic: true })
      await notifyAdmins(tx, ctx, { bountyId: bounty.id, claimId: claim!.id, note: 'A new claim to check' })
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

/** Back to taking claims once the claim it was waiting on is gone, inside the caller's transaction. */
async function reopenFor(tx: Tx, bounty: Bounty, claimId: string): Promise<void> {
  if (bounty.winningClaimId !== claimId) return
  await tx.update(bounties).set({ status: 'OPEN', winningClaimId: null }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'AWAITING_VERIFICATION'), eq(bounties.winningClaimId, claimId)))
}

export async function withdrawClaim(ctx: MoneyContext, claimant: User, claimId: string): Promise<BountyClaim> {
  const { claim, bounty } = await claimById(ctx.db, claimId)
  if (claim.claimantId !== claimant.id) throw notFound('Claim')
  // Until the payout is sent; after that the money is on its way.
  if (!['SUBMITTED', 'APPROVED', 'CONFIRMED', 'DISPUTED'].includes(claim.status)) throw badInput('This claim can’t be withdrawn now.')
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx.update(bountyClaims).set({ status: 'WITHDRAWN' }).where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, claim.status))).returning()
    if (!updated) throw badInput('This claim changed while you were looking at it. Reload and try again.')
    await reopenFor(tx, bounty, claim.id)
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_WITHDRAWN', actorId: claimant.id, recipientId: bounty.posterId })
    return updated
  })
}

/** An approved claim the poster is answering: theirs, still waiting, on a bounty still waiting on it. */
async function approvedClaimFor(ctx: MoneyContext, poster: User, claimId: string): Promise<{ claim: BountyClaim; bounty: Bounty }> {
  const found = await claimById(ctx.db, claimId)
  // A poster can't see a claim before CIVIC/ONE approved it, so they can't answer one either.
  if (found.bounty.posterId !== poster.id || !found.claim.approvedAt) throw notFound('Claim')
  if (found.claim.status !== 'APPROVED') throw badInput('This claim has already been answered.')
  if (found.bounty.status !== 'AWAITING_VERIFICATION' || found.bounty.winningClaimId !== found.claim.id) throw badInput('This bounty isn’t taking an answer right now.')
  return found
}

/** The poster says the outcome happened. CIVIC/ONE pays once the cooling-off period ends. */
export async function confirmClaim(ctx: MoneyContext, poster: User, claimId: string, rawNote: string | null | undefined): Promise<BountyClaim> {
  const { claim, bounty } = await approvedClaimFor(ctx, poster, claimId)
  const note = rawNote ? bountyNoteSchema.parse(rawNote) : null
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bountyClaims)
      .set({ status: 'CONFIRMED', confirmNote: note, confirmedAt: new Date() })
      .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, 'APPROVED')))
      .returning()
    // Withdrawn a moment ago.
    if (!updated) throw badInput('This claim changed while you were looking at it. Reload and try again.')
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_CONFIRMED', actorId: poster.id, recipientId: claim.claimantId, isPublic: true })
    await notifyAdmins(tx, ctx, { bountyId: bounty.id, claimId: claim.id, note: 'The poster confirmed. Pay once the cooling-off period ends.' })
    return updated
  })
}

/** The poster says the outcome didn't happen, with a reason for the reviewer. CIVIC/ONE decides, and may pay anyway. */
export async function objectToClaim(ctx: MoneyContext, poster: User, claimId: string, rawNote: string): Promise<BountyClaim> {
  const { claim, bounty } = await approvedClaimFor(ctx, poster, claimId)
  const note = bountyNoteSchema.parse(rawNote)
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(bountyClaims)
      .set({ status: 'DISPUTED', posterNote: note, disputedAt: new Date() })
      .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, 'APPROVED')))
      .returning()
    if (!updated) throw badInput('This claim changed while you were looking at it. Reload and try again.')
    // The claimant hears that the poster objected; the reason is for the reviewer.
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_DISPUTED', actorId: poster.id, recipientId: claim.claimantId, isPublic: true })
    await notifyAdmins(tx, ctx, { bountyId: bounty.id, claimId: claim.id, note: `The poster objected: ${note}` })
    return updated
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

/**
 * What CIVIC/ONE does with a claim, in order: APPROVE a new one after checking
 * it (the poster then sees it and confirms or objects), VERIFY one the poster
 * confirmed, didn't answer in time or objected to (that last is an override),
 * which sends the payout once the cooling-off period ends; or REJECT, at any
 * point before the payout.
 */
export async function decideClaim(
  ctx: MoneyContext,
  admin: User,
  claimId: string,
  decision: 'APPROVE' | 'VERIFY' | 'REJECT',
  reason: ClaimDecisionReason,
  rawNote: string,
): Promise<BountyClaim> {
  const { claim, bounty } = await claimById(ctx.db, claimId)
  if (claim.claimantId === admin.id) throw forbidden('You can’t decide a claim on a bounty you’re part of.')
  await notParty(ctx.db, admin, bounty, 'You can’t decide a claim on a bounty you’re part of.')
  if (bounty.status !== 'AWAITING_VERIFICATION' && bounty.status !== 'OPEN') throw badInput('This bounty isn’t taking decisions right now.')
  const note = bountyNoteSchema.parse(rawNote)
  const now = new Date()

  if (decision === 'APPROVE') return approveClaim(ctx, admin, claim, bounty, note, now)

  if (decision === 'REJECT') {
    if (!['SUBMITTED', 'APPROVED', 'CONFIRMED', 'DISPUTED'].includes(claim.status)) throw badInput('This claim isn’t waiting for a decision.')
    if (reason === 'VERIFIED' || reason === 'ADMIN_OVERRIDE') throw badInput('Choose a reason for rejecting.')
    const { rejected, refund } = await ctx.db.transaction(async (tx) => {
      const [decided] = await tx
        .update(bountyClaims)
        .set({ status: 'REJECTED', decisionReason: reason, decisionNote: note, decidedById: admin.id, decidedAt: now })
        .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, claim.status)))
        .returning()
      if (!decided) throw badInput('This claim changed while you were looking at it. Reload and try again.')
      let queued: LedgerEntry | null = null
      if (bounty.winningClaimId === claim.id) {
        // Back to taking claims. If its time ran out while this one was under review it expires now, unless other claims
        // are still being decided: then it reopens and the sweep expires it once they are, as with any open bounty.
        const outOfTime = bounty.expiresAt !== null && bounty.expiresAt < now
        if (outOfTime && !(await liveClaimCount(tx, bounty.id))) {
          queued = await closeAndRefund(tx, { ...bounty, status: 'AWAITING_VERIFICATION' }, 'EXPIRED', 'EXPIRED', 'The bounty expired', null, true)
        } else {
          await reopenFor(tx, bounty, claim.id)
        }
      }
      // The poster only hears about claims they were shown, and gets the public reason; the admin's note goes to the claimant.
      if (claim.approvedAt) {
        await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_REJECTED', actorId: admin.id, byAdmin: true, recipientId: bounty.posterId, note: CLAIM_DECISION_LABEL[reason] })
      }
      await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_REJECTED', actorId: admin.id, byAdmin: true, recipientId: claim.claimantId, note })
      return { rejected: decided, refund: queued }
    })
    if (refund) await sendRefund(ctx, refund)
    return rejected
  }

  // VERIFY: the claim the bounty is waiting on, once the poster has answered or had their chance to.
  if (bounty.status !== 'AWAITING_VERIFICATION' || bounty.winningClaimId !== claim.id) throw badInput('This claim isn’t waiting to be paid.')
  const unanswered = claim.status === 'APPROVED' && claim.approvedAt !== null && posterAnswerDue(claim.approvedAt) < now
  if (claim.status === 'APPROVED' && !unanswered) {
    const due = claim.approvedAt ? posterAnswerDue(claim.approvedAt) : now
    throw badInput(`The poster has until ${due.toISOString()} to confirm or object. Pay after they answer, or after that.`, { answerDue: due.toISOString() })
  }
  if (!['APPROVED', 'CONFIRMED', 'DISPUTED'].includes(claim.status)) throw badInput('This claim isn’t waiting to be paid.')
  if (claim.status === 'DISPUTED' && reason !== 'ADMIN_OVERRIDE') throw badInput('Paying a claim the poster objected to is an override; record it as one.')
  if (claim.status !== 'DISPUTED' && reason === 'ADMIN_OVERRIDE') throw badInput('The poster didn’t object to this claim; record it as verified.')
  if (claim.cooldownUntil && claim.cooldownUntil > now) {
    throw badInput(`The cooling-off period ends ${claim.cooldownUntil.toISOString()}. Verify after that.`, { cooldownUntil: claim.cooldownUntil.toISOString() })
  }
  if (!claim.claimantId) throw badInput('The claimant deleted their account.')
  const account = await activePayoutAccount(ctx.db, claim.claimantId)
  if (!account) throw badInput('The claimant hasn’t added a payout account yet.')
  const ready = payoutAccountReadyAt(account.createdAt)
  if (ready > now) throw badInput(`The claimant’s payout account is on hold until ${ready.toISOString()}.`, { readyAt: ready.toISOString() })
  const preflight = await releasePreflight(ctx.db, bounty, claim)

  let released: LedgerEntry
  try {
    released = await ctx.db.transaction(async (tx) => {
      const [updatedBounty] = await tx
        .update(bounties)
        .set({ status: 'RELEASING' })
        .where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'AWAITING_VERIFICATION'), eq(bounties.winningClaimId, claim.id)))
        .returning()
      if (!updatedBounty) throw badInput('This bounty changed while you were looking at it. Reload and try again.')
      const [updated] = await tx
        .update(bountyClaims)
        .set({ status: 'VERIFIED', decisionReason: reason, decisionNote: note, decidedById: admin.id, decidedAt: now, preflight: JSON.stringify(preflight), payoutAccountId: account.id })
        .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, claim.status)))
        .returning()
      if (!updated) throw badInput('This claim changed while you were looking at it. Reload and try again.')
      const release = await queueRelease(tx, updatedBounty, updated, account)
      if (unanswered) {
        await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_ESCALATED', recipientId: bounty.posterId, isPublic: true, note: `The poster didn’t answer within ${CLAIM_POSTER_RESPONSE_DAYS} days, which counts as no objection` })
      }
      await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_VERIFIED', actorId: admin.id, byAdmin: true, recipientId: claim.claimantId, isPublic: true, note })
      return release
    })
  } catch (error) {
    if (violates(error, 'bounty_claims_one_winner_idx')) throw badInput('Another claim on this bounty is already approved or paid.')
    throw error
  }
  await sendTransfer(ctx, released)
  return (await claimById(ctx.db, claim.id)).claim
}

/** CIVIC/ONE checked a new claim and it holds up: the poster now sees it, and the cooling-off period starts. */
async function approveClaim(ctx: MoneyContext, admin: User, claim: BountyClaim, bounty: Bounty, note: string, now: Date): Promise<BountyClaim> {
  if (claim.status !== 'SUBMITTED') throw badInput('This claim has already been checked.')
  if (bounty.status !== 'OPEN' || bounty.winningClaimId) throw badInput('Another claim on this bounty is already approved. Decide that one first.')
  try {
    return await ctx.db.transaction(async (tx) => {
      const [waiting] = await tx
        .update(bounties)
        .set({ status: 'AWAITING_VERIFICATION', winningClaimId: claim.id })
        .where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'OPEN'), isNull(bounties.winningClaimId)))
        .returning()
      if (!waiting) throw badInput('This bounty changed while you were looking at it. Reload and try again.')
      const [approved] = await tx
        .update(bountyClaims)
        .set({ status: 'APPROVED', approvedAt: now, cooldownUntil: claimCooldownEnds(now, bounty.kind) })
        .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, 'SUBMITTED')))
        .returning()
      // Withdrawn a moment ago: the bounty goes back to how it was.
      if (!approved) throw badInput('This claim changed while you were looking at it. Reload and try again.')
      await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_APPROVED', actorId: admin.id, byAdmin: true, recipientId: bounty.posterId, isPublic: true, note })
      await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_APPROVED', actorId: admin.id, byAdmin: true, recipientId: claim.claimantId, note })
      return approved
    })
  } catch (error) {
    if (violates(error, 'bounty_claims_one_winner_idx')) throw badInput('Another claim on this bounty is already approved. Decide that one first.')
    throw error
  }
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
  let existing: TransferResult | null
  try {
    // Paystack keeps a transfer per reference; find it first so a retried step never pays twice.
    existing = await provider.fetchTransfer(release.reference)
  } catch (error) {
    console.error('[bounties] transfer not checked', { release: release.reference, error })
    return
  }
  try {
    const result =
      existing ??
      (await provider.transfer({ reference: release.reference, amountCents: release.amountCents, currency: release.currency, recipientCode: account.recipientCode, reason: 'CIVIC/ONE bounty' }))
    await applyTransfer(ctx, release.reference, result.status, result.providerRef)
  } catch (error) {
    console.error('[bounties] transfer not sent', { release: release.reference, error })
    // A refusal (not enough balance, a dead recipient) is a failed payout an admin retries once it's fixed; a timeout or an
    // outage is left for the sweep. "Already exists" means it went through after all, and the sweep finds it by reference.
    const refused = existing === null && error instanceof PaymentProviderError && error.status !== undefined && error.status >= 400 && error.status < 500 && error.status !== 429
    if (refused && !/exist|duplicate/i.test(error.message)) {
      await applyTransfer(ctx, release.reference, 'FAILED', null, `The provider refused the transfer: ${error.message}`).catch((failure: unknown) =>
        console.error('[bounties] payout failure not recorded', { release: release.reference, failure }),
      )
    }
  }
}

/** Applies what the provider says about a payout: taken, settled, failed, or reversed after settling. */
export async function applyTransfer(ctx: MoneyContext, reference: string, status: TransferStatus, providerRef: string | null, note?: string): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const [entry] = await tx.select().from(ledgerEntries).where(eq(ledgerEntries.reference, reference)).for('update')
    if (!entry || entry.type !== 'RELEASE') return
    const [bounty] = await tx.select().from(bounties).where(eq(bounties.id, entry.bountyId)).for('update')
    if (!bounty) return
    if (status === 'PENDING') {
      // Told once, when the provider first takes it; the sweep asks after it every hour until it settles.
      if (providerRef && !entry.providerRef) {
        await tx.update(ledgerEntries).set({ providerRef }).where(eq(ledgerEntries.id, entry.id))
        await addEvent(tx, { bountyId: bounty.id, claimId: entry.claimId, kind: 'PAYOUT_SENT', isPublic: true })
      }
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
      const others = await tx
        .select()
        .from(bountyClaims)
        .where(and(eq(bountyClaims.bountyId, bounty.id), inArray(bountyClaims.status, ['SUBMITTED', 'APPROVED', 'CONFIRMED', 'DISPUTED']), entry.claimId ? ne(bountyClaims.id, entry.claimId) : undefined))
      for (const other of others) {
        await tx.update(bountyClaims).set({ status: 'REJECTED', decisionReason: 'OTHER_CLAIM_PAID', decidedAt: new Date() }).where(eq(bountyClaims.id, other.id))
        await addEvent(tx, { bountyId: bounty.id, claimId: other.id, kind: 'CLAIM_REJECTED', recipientId: other.claimantId, note: 'Another claim was paid' })
      }
      await addEvent(tx, { bountyId: bounty.id, claimId: entry.claimId, kind: 'PAID', recipientId: entry.userId, isPublic: true })
      await addEvent(tx, { bountyId: bounty.id, claimId: entry.claimId, kind: 'PAID', recipientId: bounty.posterId })
      return
    }
    if ((status === 'FAILED' || status === 'REVERSED') && entry.status === 'PENDING') {
      // Never paid: the bank bounced it, or the provider sent the money back before it settled. An admin retries.
      await tx
        .update(ledgerEntries)
        .set({ status: 'FAILED', providerRef: providerRef ?? entry.providerRef, note: note ?? (status === 'REVERSED' ? 'Returned by the provider before it settled' : 'The bank rejected the transfer') })
        .where(eq(ledgerEntries.id, entry.id))
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

/** After a failed or reversed payout, an admin sends it again, to the claimant's current account, under the same checks as the first time. */
export async function retryPayout(ctx: MoneyContext, admin: User, bountyId: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || bounty.status !== 'RELEASING' || !bounty.winningClaimId) throw badInput('There is no payout to retry on this bounty.')
  await notParty(ctx.db, admin, bounty)
  const { claim } = await claimById(ctx.db, bounty.winningClaimId)
  if (!claim.claimantId) throw badInput('The claimant deleted their account.')
  const account = await activePayoutAccount(ctx.db, claim.claimantId)
  if (!account) throw badInput('The claimant has no payout account.')
  // The same hold as the first time: a payout never goes to an account added minutes ago.
  const ready = payoutAccountReadyAt(account.createdAt)
  if (ready > new Date()) throw badInput(`The claimant’s payout account is on hold until ${ready.toISOString()}.`, { readyAt: ready.toISOString() })
  const preflight = await releasePreflight(ctx.db, bounty, claim)
  const release = await ctx.db.transaction(async (tx) => {
    const live = await liveRelease(tx, bounty.id)
    if (live) return live
    // The record shows what was checked for the account actually being paid.
    await tx.update(bountyClaims).set({ payoutAccountId: account.id, preflight: JSON.stringify(preflight) }).where(eq(bountyClaims.id, claim.id))
    await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'PAYOUT_SENT', actorId: admin.id, byAdmin: true, note: `Payout retried to ${account.bankName} ••••${account.accountLast4}` })
    return queueRelease(tx, bounty, { ...claim, payoutAccountId: account.id }, account)
  })
  await sendTransfer(ctx, release)
  return (await bountyById(ctx.db, bounty.id))!
}

async function liveRelease(db: Database | Tx, bountyId: string): Promise<LedgerEntry | null> {
  const [row] = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.bountyId, bountyId), eq(ledgerEntries.type, 'RELEASE'), inArray(ledgerEntries.status, ['PENDING', 'SETTLED'])))
  return row ?? null
}

/** After the provider failed a refund, an admin sends it again, against the same deposit. */
export async function retryRefund(ctx: MoneyContext, admin: User, bountyId: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty) throw notFound()
  await notParty(ctx.db, admin, bounty)
  const refunds = await ctx.db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.bountyId, bounty.id), eq(ledgerEntries.type, 'REFUND')))
    .orderBy(desc(ledgerEntries.createdAt))
  if (refunds.some((row) => row.status === 'PENDING')) throw badInput('A refund is already on its way.')
  const failed = refunds.find((row) => row.status === 'FAILED')
  const owed = bounty.depositedCents - bounty.releasedCents - bounty.refundedCents
  const deposit = failed ? await refundedDeposit(ctx.db, failed) : null
  if (!failed || !deposit || owed <= 0) throw badInput('There is no refund to retry on this bounty.')
  const refund = await ctx.db.transaction((tx) => queueRefund(tx, bounty, deposit, 'Refund sent again by CIVIC/ONE', admin.id, true, Math.min(owed, failed.amountCents)))
  if (refund) await sendRefund(ctx, refund)
  return (await bountyById(ctx.db, bounty.id))!
}

export async function approveBounty(ctx: MoneyContext, admin: User, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || bounty.status !== 'PENDING_REVIEW') throw badInput('This bounty isn’t waiting for review.')
  await notParty(ctx.db, admin, bounty, 'You can’t review your own bounty.')
  const note = bountyNoteSchema.parse(rawNote)
  const [updated] = await ctx.db.transaction(async (tx) => {
    await addEvent(tx, { bountyId: bounty.id, kind: 'APPROVED', actorId: admin.id, byAdmin: true, recipientId: bounty.posterId, isPublic: true, note })
    return tx.update(bounties).set({ status: 'OPEN', listedAt: new Date() }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'PENDING_REVIEW'))).returning()
  })
  return updated ?? bounty
}

export async function declineBounty(ctx: MoneyContext, admin: User, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || bounty.status !== 'PENDING_REVIEW') throw badInput('This bounty isn’t waiting for review.')
  await notParty(ctx.db, admin, bounty, 'You can’t review your own bounty.')
  const note = bountyNoteSchema.parse(rawNote)
  const refund = await ctx.db.transaction(async (tx) => {
    await addEvent(tx, { bountyId: bounty.id, kind: 'DECLINED', actorId: admin.id, byAdmin: true, recipientId: bounty.posterId, note })
    return closeAndRefund(tx, bounty, 'CANCELLED', 'CANCELLED', 'Declined by CIVIC/ONE', admin.id, true)
  })
  if (refund) await sendRefund(ctx, refund)
  return (await bountyById(ctx.db, bounty.id))!
}

/** Closes a bounty from the review side and refunds the poster. With `takeDown`, the page stays visible only to the poster, claimants and CIVIC/ONE. */
export async function adminCancelBounty(ctx: MoneyContext, admin: User, bountyId: string, rawNote: string, takeDown = false): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty) throw badInput('This bounty can’t be cancelled now.')
  await notParty(ctx.db, admin, bounty)
  // A payout that failed and can't go anywhere is the one way out of RELEASING.
  const cancellable = ['OPEN', 'AWAITING_VERIFICATION', 'PENDING_REVIEW', 'FROZEN'].includes(bounty.status) || (bounty.status === 'RELEASING' && !(await liveRelease(ctx.db, bounty.id)))
  if (!cancellable) throw badInput('This bounty can’t be cancelled now.')
  const note = bountyNoteSchema.parse(rawNote)
  const refund = await ctx.db.transaction(async (tx) => {
    if (takeDown) await tx.update(bounties).set({ removedAt: new Date() }).where(eq(bounties.id, bounty.id))
    return closeAndRefund(tx, bounty, 'CANCELLED', 'CANCELLED', note, admin.id, true)
  })
  if (refund) await sendRefund(ctx, refund)
  return (await bountyById(ctx.db, bounty.id))!
}

export async function freezeBounty(ctx: MoneyContext, admin: User | null, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || !['OPEN', 'AWAITING_VERIFICATION', 'PENDING_REVIEW'].includes(bounty.status)) throw badInput('This bounty can’t be put on hold now.')
  if (admin) await notParty(ctx.db, admin, bounty)
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

/** The card dispute still open over a bounty's payment: a CHARGEBACK row without its CHARGEBACK_REVERSED. */
async function openChargeback(db: Database | Tx, bountyId: string): Promise<LedgerEntry | null> {
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.bountyId, bountyId), inArray(ledgerEntries.type, ['CHARGEBACK', 'CHARGEBACK_REVERSED'])))
    .orderBy(asc(ledgerEntries.createdAt))
  const closed = new Set(rows.filter((row) => row.type === 'CHARGEBACK_REVERSED').map((row) => row.idempotencyKey.replace(/:RESOLVED$/, '')))
  return rows.find((row) => row.type === 'CHARGEBACK' && !closed.has(row.idempotencyKey.replace(/:CREATED$/, ''))) ?? null
}

/**
 * Releases an admin's hold, or the bank's: with a dispute open over the
 * payment, releasing says the bank found for CIVIC/ONE (the dashboard shows
 * it; the webhook can't be trusted to say who won) and the money counts as
 * held again.
 */
export async function unfreezeBounty(ctx: MoneyContext, admin: User, bountyId: string, rawNote: string): Promise<Bounty> {
  const bounty = await bountyById(ctx.db, bountyId)
  if (!bounty || bounty.status !== 'FROZEN' || !bounty.frozenFromStatus) throw badInput('This bounty isn’t on hold.')
  await notParty(ctx.db, admin, bounty)
  const note = bountyNoteSchema.parse(rawNote)
  const dispute = await openChargeback(ctx.db, bounty.id)
  // Time on hold doesn't count against the bounty (missing-person bounties still end within their cap).
  const [frozen] = await ctx.db.select().from(bountyEvents).where(and(eq(bountyEvents.bountyId, bounty.id), eq(bountyEvents.kind, 'FROZEN'))).orderBy(desc(bountyEvents.createdAt)).limit(1)
  const extendBy = frozen ? Date.now() - frozen.createdAt.getTime() : 0
  const cap = bounty.fundedAt ? bountyExpiresAt(bounty.fundedAt, BOUNTY_KIND_RULES[bounty.kind].maxDays) : null
  const extended = bounty.expiresAt ? new Date(Math.min(bounty.expiresAt.getTime() + extendBy, cap?.getTime() ?? Infinity)) : null
  const [updated] = await ctx.db.transaction(async (tx) => {
    if (dispute) {
      await tx
        .insert(ledgerEntries)
        .values({
          bountyId: bounty.id,
          userId: dispute.userId,
          type: 'CHARGEBACK_REVERSED',
          status: 'SETTLED',
          amountCents: dispute.amountCents,
          currency: dispute.currency,
          provider: dispute.provider,
          reference: dispute.reference.replace(/-open$/, '-closed'),
          providerRef: dispute.providerRef,
          idempotencyKey: dispute.idempotencyKey.replace(/:CREATED$/, ':RESOLVED'),
          settledAt: new Date(),
          note: 'Hold released by CIVIC/ONE: the dispute closed in its favour',
        })
        .onConflictDoNothing()
      await addEvent(tx, { bountyId: bounty.id, kind: 'CHARGEBACK', actorId: admin.id, byAdmin: true, note: 'The dispute over the payment is closed; the money is held again' })
    }
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
    // Who reported is in bounty_reports, for admins; the event never names them, whoever reads the trail.
    if (inserted.length) await addEvent(tx, { bountyId: bounty.id, kind: 'REPORTED', note: parsed.data.reason })
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
  // A bank account stays tied to the person who first linked it, replaced or not. The answer doesn't say whose it is.
  const [known] = await ctx.db.select().from(payoutAccounts).where(eq(payoutAccounts.fingerprint, fingerprint))
  if (known && known.userId !== null && known.userId !== user.id) throw badInput('That bank account can’t be linked to this CIVIC/ONE account.')
  if (known?.status === 'ACTIVE' && known.userId === user.id) return known

  const recipient =
    known?.userId === user.id
      ? { recipientCode: known.recipientCode, accountName: known.accountName }
      : await provider.createRecipient({ name: input.accountName, accountNumber: input.accountNumber, bankCode: input.bankCode })
  return ctx.db.transaction(async (tx) => {
    await tx.update(payoutAccounts).set({ status: 'REPLACED', replacedAt: new Date() }).where(and(eq(payoutAccounts.userId, user.id), eq(payoutAccounts.status, 'ACTIVE')))
    if (known) {
      // Their own earlier account comes back as it was (its hold was served); one left behind by a deleted account starts the hold again.
      const [row] = await tx
        .update(payoutAccounts)
        .set({
          userId: user.id,
          provider: provider.name,
          recipientCode: recipient.recipientCode,
          bankName: bank.name,
          accountName: recipient.accountName ?? input.accountName,
          status: 'ACTIVE',
          replacedAt: null,
          createdAt: known.userId === user.id ? known.createdAt : new Date(),
        })
        .where(eq(payoutAccounts.id, known.id))
        .returning()
      return row!
    }
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

/**
 * Records the event first, then applies it. A redelivery finds the row and does
 * nothing, unless the earlier attempt never finished (the row still says
 * RECEIVED): then the redelivery is the retry, which is safe because every
 * apply step is idempotent on the ledger. Returns what happened, for the row.
 */
export async function handleProviderEvent(ctx: MoneyContext, event: ProviderEvent, payload: string): Promise<string> {
  const provider = ctx.payments.provider
  if (!provider) return 'IGNORED'
  const inserted = await ctx.db
    .insert(paymentEvents)
    .values({ provider: provider.name, eventKey: event.eventKey, eventType: event.eventType, reference: 'reference' in event ? event.reference : 'transactionRef' in event ? event.transactionRef : null, payload })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id })
  let id = inserted[0]?.id
  if (!id) {
    const [earlier] = await ctx.db
      .select({ id: paymentEvents.id, outcome: paymentEvents.outcome })
      .from(paymentEvents)
      .where(and(eq(paymentEvents.provider, provider.name), eq(paymentEvents.eventKey, event.eventKey)))
    if (!earlier || earlier.outcome !== 'RECEIVED') return 'DUPLICATE'
    id = earlier.id
  }
  const outcome = await applyProviderEvent(ctx, event)
  await ctx.db.update(paymentEvents).set({ outcome }).where(eq(paymentEvents.id, id))
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
      return applyChargeback(ctx, event.transactionRef, event.status, event.resolution ?? null)
    default:
      return 'IGNORED'
  }
}

/**
 * A card dispute over a deposit. Opening one freezes the bounty: nothing moves
 * while the bank decides. When it closes with the cardholder getting the money
 * back, the bounty closes without a refund of its own (the bank made one); any
 * other outcome is left to an admin, who releases the hold once the Paystack
 * dashboard shows the dispute closed in CIVIC/ONE's favour.
 */
async function applyChargeback(ctx: MoneyContext, transactionRef: string, status: 'CREATED' | 'REMINDED' | 'RESOLVED', resolution: string | null): Promise<string> {
  const deposit = await depositByRef(ctx.db, transactionRef)
  if (!deposit) return 'UNKNOWN_REFERENCE'
  if (status === 'REMINDED') return 'IGNORED'
  await ctx.db.transaction(async (tx) => {
    const [bounty] = await tx.select().from(bounties).where(eq(bounties.id, deposit.bountyId)).for('update')
    if (!bounty) return
    if (status === 'CREATED') {
      await tx
        .insert(ledgerEntries)
        .values({
          bountyId: bounty.id,
          userId: deposit.userId,
          type: 'CHARGEBACK',
          status: 'SETTLED',
          amountCents: deposit.amountCents,
          currency: deposit.currency,
          provider: deposit.provider,
          reference: `cbk-${deposit.reference}-open`,
          providerRef: deposit.providerRef,
          idempotencyKey: `chargeback:${deposit.id}:CREATED`,
          settledAt: new Date(),
          note: 'The poster’s bank opened a dispute over the payment',
        })
        .onConflictDoNothing()
      await addEvent(tx, { bountyId: bounty.id, kind: 'CHARGEBACK', note: 'The poster’s bank opened a dispute over the payment' })
      if (['OPEN', 'AWAITING_VERIFICATION', 'PENDING_REVIEW'].includes(bounty.status)) {
        await tx.update(bounties).set({ status: 'FROZEN', frozenFromStatus: bounty.status }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, bounty.status)))
        await addEvent(tx, { bountyId: bounty.id, kind: 'FROZEN', byAdmin: true, recipientId: bounty.posterId, note: 'Your bank opened a dispute over the payment, so the bounty is on hold until it’s resolved.' })
      }
      return
    }
    // Paystack names the outcome in `resolution`: "merchant-accepted" and "auto-accepted" mean the cardholder got the money back.
    if (!/accepted/i.test(resolution ?? '')) {
      await addEvent(tx, { bountyId: bounty.id, kind: 'CHARGEBACK', note: `The dispute was resolved (${resolution || 'no resolution given'}). Check it in the Paystack dashboard and release the hold once the money is confirmed back.` })
      return
    }
    await addEvent(tx, { bountyId: bounty.id, kind: 'CHARGEBACK', note: `The dispute closed in the cardholder’s favour (${resolution}): the bank returned the payment` })
    const [queued] = await tx
      .select({ n: sql<number>`coalesce(sum(${ledgerEntries.amountCents}), 0)::int` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.bountyId, bounty.id), eq(ledgerEntries.type, 'REFUND'), eq(ledgerEntries.status, 'PENDING')))
    const remaining = bounty.depositedCents - bounty.releasedCents - bounty.refundedCents - (queued?.n ?? 0)
    // Paid out already: the loss is CIVIC/ONE's, and on record.
    if (!FUNDED.includes(bounty.status) || remaining <= 0) return
    // The money went back through the bank: it counts as refunded, and the bounty closes without a refund of its own.
    await tx
      .update(bounties)
      .set({ status: 'CANCELLED', closedAt: new Date(), winningClaimId: null, frozenFromStatus: null, refundedCents: bounty.refundedCents + remaining })
      .where(and(eq(bounties.id, bounty.id), eq(bounties.status, bounty.status)))
    await addEvent(tx, { bountyId: bounty.id, kind: 'CANCELLED', byAdmin: true, recipientId: bounty.posterId, isPublic: true, note: 'Your bank reversed the payment, so the bounty is closed' })
    await closeLiveClaims(tx, bounty.id, 'The bounty was closed')
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
  scrubbed: number
}

export async function sweep(ctx: MoneyContext): Promise<SweepReport> {
  const now = new Date()
  const report: SweepReport = { abandoned: 0, expired: 0, expiring: 0, escalated: 0, redriven: 0, scrubbed: 0 }
  // Each step runs on its own: a failure in one never keeps money from moving in another.
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run()
    } catch (error) {
      console.error(`[bounties] sweep step failed: ${name}`, error)
    }
  }

  // Checkouts nobody completed.
  await step('abandon unpaid bounties', async () => {
    const stale = await ctx.db.select().from(bounties).where(and(eq(bounties.status, 'PENDING_PAYMENT'), lt(bounties.createdAt, new Date(now.getTime() - hours(PENDING_PAYMENT_TTL_HOURS)))))
    for (const bounty of stale) {
      const [updated] = await ctx.db.transaction(async (tx) => {
        const deposit = await liveDeposit(tx, bounty.id)
        if (deposit?.status === 'PENDING') {
          await tx.update(ledgerEntries).set({ status: 'FAILED', note: 'Checkout not completed' }).where(and(eq(ledgerEntries.id, deposit.id), eq(ledgerEntries.status, 'PENDING')))
        }
        return tx.update(bounties).set({ status: 'ABANDONED', closedAt: now }).where(and(eq(bounties.id, bounty.id), eq(bounties.status, 'PENDING_PAYMENT'))).returning()
      })
      if (updated) report.abandoned++
    }
  })

  // Open bounties past their date. Ones with a claim still being answered or disputable wait.
  await step('expire', async () => {
    const dueBounties = await ctx.db.select().from(bounties).where(and(eq(bounties.status, 'OPEN'), lt(bounties.expiresAt, now)))
    for (const bounty of dueBounties) {
      if (await liveClaimCount(ctx.db, bounty.id)) continue
      const refund = await ctx.db.transaction((tx) => closeAndRefund(tx, bounty, 'EXPIRED', 'EXPIRED', 'The bounty ran out of time', null))
      if (refund) await sendRefund(ctx, refund)
      report.expired++
    }
  })

  // A reminder a few days before expiry.
  await step('remind', async () => {
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
  })

  // An approved claim the poster didn't answer in time: silence counts as no objection, and it waits for CIVIC/ONE to pay.
  await step('escalate', async () => {
    const silent = await ctx.db
      .select({ claim: bountyClaims, bounty: bounties })
      .from(bountyClaims)
      .innerJoin(bounties, eq(bounties.id, bountyClaims.bountyId))
      .where(and(eq(bountyClaims.status, 'APPROVED'), eq(bounties.status, 'AWAITING_VERIFICATION'), lt(bountyClaims.approvedAt, new Date(now.getTime() - days(CLAIM_POSTER_RESPONSE_DAYS)))))
    for (const { claim, bounty } of silent) {
      await ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(bountyClaims)
          .set({ status: 'CONFIRMED', confirmedAt: now })
          .where(and(eq(bountyClaims.id, claim.id), eq(bountyClaims.status, 'APPROVED')))
          .returning()
        if (!updated) return
        const note = `The poster didn’t answer within ${CLAIM_POSTER_RESPONSE_DAYS} days, which counts as no objection`
        await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_ESCALATED', recipientId: claim.claimantId, isPublic: true, note })
        await addEvent(tx, { bountyId: bounty.id, claimId: claim.id, kind: 'CLAIM_ESCALATED', recipientId: bounty.posterId, note })
        await notifyAdmins(tx, ctx, { bountyId: bounty.id, claimId: claim.id, note: `${note}. Pay once the cooling-off period ends.` })
        report.escalated++
      })
    }
  })

  // Money the provider was asked to move but never confirmed: ask again.
  await step('re-drive pending money', async () => {
    const provider = ctx.payments.provider
    if (!provider) return
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
        } else if (entry.type === 'REFUND' && provider.fetchRefund) {
          // Sent, and nothing heard since (a lost webhook): ask how it went.
          const result = await provider.fetchRefund(entry.providerRef!)
          if (result && result.status !== 'PENDING') await applyRefund(ctx, { reference: entry.reference, status: result.status, providerRef: result.providerRef ?? entry.providerRef })
        }
        report.redriven++
      } catch (error) {
        console.error('[bounties] sweep could not re-drive', { reference: entry.reference, error })
      }
    }
  })

  // What the privacy policy promises: a missing person's details go a week after the bounty closes, claim text a year after.
  await step('retention', async () => {
    const missing = await ctx.db
      .update(bounties)
      .set({ title: 'Missing person (details removed)', body: '', area: null, relationship: null })
      .where(and(eq(bounties.kind, 'MISSING_PERSON'), inArray(bounties.status, CLOSED), lt(bounties.closedAt, new Date(now.getTime() - days(MISSING_PERSON_TEXT_RETENTION_DAYS))), ne(bounties.body, '')))
      .returning({ id: bounties.id })
    const old = ctx.db
      .select({ id: bounties.id })
      .from(bounties)
      .where(and(inArray(bounties.status, CLOSED), lt(bounties.closedAt, new Date(now.getTime() - days(CLAIM_TEXT_RETENTION_DAYS)))))
    const claims = await ctx.db
      .update(bountyClaims)
      .set({ body: '', links: '' })
      .where(and(inArray(bountyClaims.bountyId, old), ne(bountyClaims.body, ''), or(isNull(bountyClaims.decisionReason), ne(bountyClaims.decisionReason, 'LEGAL_HOLD'))))
      .returning({ id: bountyClaims.id })
    report.scrubbed = missing.length + claims.length
  })
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
  if (isAdmin || hasClaim) return true
  if (viewer && bounty.posterId === viewer.id) return true
  if (bounty.removedAt) return false
  if (LISTED.includes(bounty.status)) return true
  // A closed bounty's page still explains a shared link, as long as it was ever on the board: one declined
  // in review, or cancelled before review, was never public and stays that way.
  return (bounty.status === 'CANCELLED' || bounty.status === 'EXPIRED') && bounty.listedAt !== null
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
  return pageBounties(db, and(live, isNull(bounties.removedAt), kind ? eq(bounties.kind, kind) : undefined), args)
}

export const pageMyBounties = (db: Database, posterId: string, args: PageArgs) => pageBounties(db, eq(bounties.posterId, posterId), args)

/** A profile's bounties: what's on the board, plus everything to its owner. */
export const pageUserBounties = (db: Database, userId: string, own: boolean, args: PageArgs) =>
  pageBounties(db, and(eq(bounties.posterId, userId), own ? undefined : and(inArray(bounties.status, LISTED), isNull(bounties.removedAt))), args)

export async function countUserBounties(db: Database, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(bounties).where(and(eq(bounties.posterId, userId), inArray(bounties.status, LISTED), isNull(bounties.removedAt)))
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

/**
 * Everything an admin should look at: reviews, confirmed claims, disputes,
 * failed payouts, holds, reports, cancellation requests, and money that is
 * still owed or unexplained on a bounty whatever its status (a failed refund,
 * a payment that didn't match).
 */
export function pageAdminQueue(db: Database, args: PageArgs) {
  // A new claim to check, or an objection to decide.
  const disputed = db.select({ id: bountyClaims.bountyId }).from(bountyClaims).where(inArray(bountyClaims.status, ['SUBMITTED', 'DISPUTED']))
  const reported = db.select({ id: bountyReports.bountyId }).from(bountyReports)
  const failedPayout = db.select({ id: ledgerEntries.bountyId }).from(ledgerEntries).where(and(eq(ledgerEntries.type, 'RELEASE'), eq(ledgerEntries.status, 'FAILED')))
  const failedRefund = db.select({ id: ledgerEntries.bountyId }).from(ledgerEntries).where(and(eq(ledgerEntries.type, 'REFUND'), eq(ledgerEntries.status, 'FAILED')))
  const mismatched = db.select({ id: ledgerEntries.bountyId }).from(ledgerEntries).where(eq(ledgerEntries.status, 'MISMATCH'))
  const cancelRequested = db.select({ id: bountyEvents.bountyId }).from(bountyEvents).where(eq(bountyEvents.kind, 'CANCEL_REQUESTED'))
  const owed = sql`${bounties.depositedCents} - ${bounties.releasedCents} - ${bounties.refundedCents} > 0`
  return pageBounties(
    db,
    or(
      and(
        inArray(bounties.status, [...FUNDED, 'PENDING_PAYMENT']),
        or(
          inArray(bounties.status, ['PENDING_REVIEW', 'AWAITING_VERIFICATION', 'RELEASING', 'FROZEN']),
          inArray(bounties.id, disputed),
          inArray(bounties.id, reported),
          inArray(bounties.id, failedPayout),
          inArray(bounties.id, cancelRequested),
        ),
      ),
      and(owed, inArray(bounties.id, failedRefund)),
      inArray(bounties.id, mismatched),
    ),
    args,
  )
}

/**
 * A bounty's claims, oldest first: every one for admins; for the poster only
 * those CIVIC/ONE has approved and the claimant hasn't withdrawn (the claimant
 * was told the poster won't see a withdrawn claim).
 */
export const claimsFor = (db: Database, bountyId: string, viewer: 'admin' | 'poster') =>
  db
    .select()
    .from(bountyClaims)
    .where(and(eq(bountyClaims.bountyId, bountyId), viewer === 'admin' ? undefined : and(ne(bountyClaims.status, 'WITHDRAWN'), isNotNull(bountyClaims.approvedAt))))
    .orderBy(asc(bountyClaims.createdAt))

/** Claims CIVIC/ONE is still checking, which the poster can't see yet. */
export async function claimsBeingChecked(db: Database, bountyId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(bountyClaims).where(and(eq(bountyClaims.bountyId, bountyId), eq(bountyClaims.status, 'SUBMITTED')))
  return row?.n ?? 0
}

/** Which of a bounty's claims CIVIC/ONE has approved: the ones the poster may know about. */
export async function approvedClaimIds(db: Database, bountyId: string): Promise<Set<string>> {
  const rows = await db.select({ id: bountyClaims.id }).from(bountyClaims).where(and(eq(bountyClaims.bountyId, bountyId), isNotNull(bountyClaims.approvedAt)))
  return new Set(rows.map((row) => row.id))
}

export async function viewerClaim(db: Database, bountyId: string, viewerId: string): Promise<BountyClaim | null> {
  const [row] = await db
    .select()
    .from(bountyClaims)
    .where(and(eq(bountyClaims.bountyId, bountyId), eq(bountyClaims.claimantId, viewerId)))
    .orderBy(desc(bountyClaims.createdAt))
    .limit(1)
  return row ?? null
}

/** The trail as one viewer may see it: all of it for admins; for anyone else the public part, plus what was addressed to them or done by them. */
export const eventsFor = (db: Database, bountyId: string, viewer: { all: boolean; id: string | null }) =>
  db
    .select()
    .from(bountyEvents)
    .where(
      and(
        eq(bountyEvents.bountyId, bountyId),
        viewer.all ? undefined : or(eq(bountyEvents.isPublic, true), ...(viewer.id ? [eq(bountyEvents.recipientId, viewer.id), eq(bountyEvents.actorId, viewer.id)] : [])),
      ),
    )
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

/** Bounties that stop an account being deleted: money is held for or owed to it (a refund still to come, or one that failed). */
export async function heldForUser(db: Database, userId: string): Promise<string[]> {
  const posted = db
    .select({ id: bounties.id })
    .from(bounties)
    .where(and(eq(bounties.posterId, userId), or(inArray(bounties.status, FUNDED), sql`${bounties.depositedCents} - ${bounties.releasedCents} - ${bounties.refundedCents} > 0`)))
  const claimed = db
    .select({ id: bountyClaims.bountyId })
    .from(bountyClaims)
    .where(and(eq(bountyClaims.claimantId, userId), inArray(bountyClaims.status, ['APPROVED', 'CONFIRMED', 'DISPUTED', 'VERIFIED'])))
  // A deposit nobody paid for doesn't hold money; deletion abandons it.
  const pending = db.select({ id: ledgerEntries.bountyId }).from(ledgerEntries).where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.status, 'PENDING'), ne(ledgerEntries.type, 'DEPOSIT')))
  const rows = await db
    .select({ id: bounties.id })
    .from(bounties)
    .where(or(inArray(bounties.id, posted), inArray(bounties.id, claimed), inArray(bounties.id, pending)))
  return rows.map((row) => row.id)
}

export type { ClaimStatus }
