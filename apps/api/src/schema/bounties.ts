import {
  BOUNTY_EVENT_KINDS,
  BOUNTY_KINDS,
  BOUNTY_MAX_CENTS,
  BOUNTY_MIN_CENTS,
  BOUNTY_REPORT_REASONS,
  BOUNTY_STATUSES,
  CLAIM_DECISION_REASONS,
  CLAIM_STATUSES,
  PAYOUT_ACCOUNT_STATUSES,
  payoutAccountReadyAt,
  posterAnswerDue,
} from '@civic/core'
import type { Bounty, BountyClaim, BountyEvent, BountyReport, LedgerEntry, PayoutAccount, User } from '@civic/db'
import type { Context } from '../context'
import {
  activePayoutAccount,
  adminCancelBounty,
  approveBounty,
  approvedClaimIds,
  bountyById,
  cancelBounty,
  canSeeBounty,
  claimsBeingChecked,
  claimsFor,
  confirmClaim,
  confirmPayment,
  countUserBounties,
  createBounty,
  declineBounty,
  decideClaim,
  eventsFor,
  freezeBounty,
  heldForUser,
  latestReleaseFor,
  ledgerFor,
  pageAdminQueue,
  pageBoard,
  pageMyBounties,
  pageMyClaims,
  objectToClaim,
  pageUserBounties,
  releasePreflight,
  type ReleasePreflight,
  reportBounty,
  reportsFor,
  requestCancellation,
  retryCheckout,
  retryPayout,
  retryRefund,
  setPayoutAccount,
  settleDeposit,
  submitClaim,
  sweep,
  type SweepReport,
  unfreezeBounty,
  viewerClaim,
  withdrawClaim,
} from '../data/bounties'
import { apiError } from '../errors'
import type { Bank } from '../payments/types'
import { bountyCard, previewImage } from '../og/cards'
import { builder } from './builder'
import { NotificationRef, PostRef, PreviewImageRef, UserRef } from './types'

export const BountyKind = builder.enumType('BountyKind', { values: BOUNTY_KINDS })
export const BountyStatus = builder.enumType('BountyStatus', { values: BOUNTY_STATUSES })
export const ClaimStatus = builder.enumType('ClaimStatus', { values: CLAIM_STATUSES })
export const ClaimDecisionReason = builder.enumType('ClaimDecisionReason', { values: CLAIM_DECISION_REASONS })
export const BountyEventKind = builder.enumType('BountyEventKind', { values: BOUNTY_EVENT_KINDS })
export const BountyReportReason = builder.enumType('BountyReportReason', { values: BOUNTY_REPORT_REASONS })
export const PayoutAccountStatus = builder.enumType('PayoutAccountStatus', { values: PAYOUT_ACCOUNT_STATUSES })
export const ClaimDecision = builder.enumType('ClaimDecision', {
  values: ['APPROVE', 'VERIFY', 'REJECT'] as const,
  description: 'APPROVE a new claim after checking it (the poster then confirms or objects), VERIFY one to pay it, or REJECT.',
})
export const PaymentsStatus = builder.enumType('PaymentsStatus', {
  values: ['DISABLED', 'SANDBOX', 'PAYSTACK_TEST', 'PAYSTACK_LIVE'] as const,
  description: 'Whether bounties can be posted: DISABLED lists them read-only until payments go live.',
})

export const BountyRef = builder.objectRef<Bounty>('Bounty')
export const BountyClaimRef = builder.objectRef<BountyClaim>('BountyClaim')
export const BountyEventRef = builder.objectRef<BountyEvent & { viewerMaySeeNote: boolean }>('BountyEvent')
export const BountyReportRef = builder.objectRef<BountyReport>('BountyReport')
export const LedgerEntryRef = builder.objectRef<LedgerEntry>('LedgerEntry')
export const PayoutAccountRef = builder.objectRef<PayoutAccount>('PayoutAccount')
export const BankRef = builder.objectRef<Bank>('Bank')
export const ReleasePreflightRef = builder.objectRef<ReleasePreflight>('ReleasePreflight')
export const CheckoutRef = builder.objectRef<{ bounty: Bounty; checkoutUrl: string | null }>('BountyCheckout')
export const SweepReportRef = builder.objectRef<SweepReport>('SweepReport')

export const BountyConnection = builder.connectionObject({ type: BountyRef, name: 'BountyConnection' }, { name: 'BountyEdge' })
export const BountyClaimConnection = builder.connectionObject({ type: BountyClaimRef, name: 'BountyClaimConnection' }, { name: 'BountyClaimEdge' })

/** Who the viewer is to this bounty; decides what they may see. */
async function access(bounty: Bounty, ctx: Context) {
  const viewer = await ctx.viewer()
  const isAdmin = await ctx.isAdmin()
  const isPoster = Boolean(viewer && bounty.posterId === viewer.id)
  const claim = viewer && !isPoster ? await viewerClaim(ctx.db, bounty.id, viewer.id) : null
  return { viewer, isAdmin, isPoster, claim }
}

const money = (ctx: Context) => ({ db: ctx.db, payments: ctx.payments, adminHandles: ctx.adminHandles })

/** Whether the viewer is an admin, or posted the bounty this claim is on. */
async function posterOrAdmin(claim: BountyClaim, ctx: Context): Promise<boolean> {
  if (await ctx.isAdmin()) return true
  const viewer = await ctx.viewer()
  if (!viewer) return false
  return (await ctx.loaders.bounty.load(claim.bountyId))?.posterId === viewer.id
}

BountyRef.implement({
  description: 'A reward, paid in up front and held by CIVIC/ONE, for a verifiable outcome.',
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.field({ type: BountyKind, resolve: (bounty) => bounty.kind }),
    status: t.field({ type: BountyStatus, resolve: (bounty) => bounty.status }),
    title: t.exposeString('title'),
    body: t.exposeString('body'),
    area: t.exposeString('area', { nullable: true }),
    amountCents: t.exposeInt('amountCents'),
    currency: t.exposeString('currency'),
    durationDays: t.exposeInt('durationDays'),
    createdAt: t.field({ type: 'DateTime', resolve: (bounty) => bounty.createdAt }),
    fundedAt: t.field({ type: 'DateTime', nullable: true, resolve: (bounty) => bounty.fundedAt }),
    expiresAt: t.field({ type: 'DateTime', nullable: true, resolve: (bounty) => bounty.expiresAt }),
    closedAt: t.field({ type: 'DateTime', nullable: true, resolve: (bounty) => bounty.closedAt }),
    removedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Taken down: only the poster, claimants and admins can open it. Poster and admins only.',
      resolve: async (bounty, _, ctx) => {
        const { isAdmin, isPoster } = await access(bounty, ctx)
        return isAdmin || isPoster ? bounty.removedAt : null
      },
    }),
    isExpired: t.boolean({
      description: 'Open but past its date; the hourly sweep closes and refunds it.',
      resolve: (bounty) => bounty.status === 'OPEN' && bounty.expiresAt !== null && bounty.expiresAt < new Date(),
    }),
    sapsCaseNumber: t.string({
      nullable: true,
      description: 'Public on missing-person bounties (a sighting needs it to call 10111); otherwise for signed-in members.',
      resolve: async (bounty, _, ctx) => (bounty.kind === 'MISSING_PERSON' || (await ctx.viewer()) ? bounty.sapsCaseNumber : null),
    }),
    relationship: t.string({
      nullable: true,
      description: 'Missing person: how the poster knows them. Poster and admins only.',
      resolve: async (bounty, _, ctx) => {
        const { isAdmin, isPoster } = await access(bounty, ctx)
        return isAdmin || isPoster ? bounty.relationship : null
      },
    }),
    poster: t.field({
      type: UserRef,
      nullable: true,
      description: 'Null once the poster deleted their account.',
      resolve: (bounty, _, ctx) => (bounty.posterId ? ctx.loaders.user.load(bounty.posterId) : null),
    }),
    post: t.field({ type: PostRef, nullable: true, resolve: (bounty, _, ctx) => (bounty.postId ? ctx.loaders.post.load(bounty.postId) : null) }),
    claimCount: t.int({ resolve: (bounty, _, ctx) => ctx.loaders.claimCount.load(bounty.id) }),
    viewerIsPoster: t.boolean({ resolve: async (bounty, _, ctx) => (await access(bounty, ctx)).isPoster }),
    viewerClaim: t.field({ type: BountyClaimRef, nullable: true, resolve: async (bounty, _, ctx) => (await access(bounty, ctx)).claim }),
    claims: t.field({
      type: [BountyClaimRef],
      description: 'Claims, oldest first. Admins see every one; the poster only those CIVIC/ONE has approved; everyone else an empty list.',
      resolve: async (bounty, _, ctx) => {
        const { isAdmin, isPoster } = await access(bounty, ctx)
        return isAdmin ? claimsFor(ctx.db, bounty.id, 'admin') : isPoster ? claimsFor(ctx.db, bounty.id, 'poster') : []
      },
    }),
    claimsBeingChecked: t.int({
      description: 'Claims CIVIC/ONE is still checking, which the poster can’t see yet. Poster and admins only; 0 for everyone else.',
      resolve: async (bounty, _, ctx) => {
        const { isAdmin, isPoster } = await access(bounty, ctx)
        return isAdmin || isPoster ? claimsBeingChecked(ctx.db, bounty.id) : 0
      },
    }),
    winningClaim: t.field({
      type: BountyClaimRef,
      nullable: true,
      description: 'The claim CIVIC/ONE approved, through to paid. Poster and admins only.',
      resolve: async (bounty, _, ctx) => {
        if (!bounty.winningClaimId) return null
        const { isAdmin, isPoster } = await access(bounty, ctx)
        if (!isAdmin && !isPoster) return null
        return (await claimsFor(ctx.db, bounty.id, isAdmin ? 'admin' : 'poster')).find((row) => row.id === bounty.winningClaimId) ?? null
      },
    }),
    events: t.field({
      type: [BountyEventRef],
      description: 'The activity trail, oldest first: the public part for everyone, plus what was addressed to or done by the viewer; all of it for admins.',
      resolve: async (bounty, _, ctx) => {
        const { viewer, isAdmin, isPoster, claim } = await access(bounty, ctx)
        const every = await eventsFor(ctx.db, bounty.id, { all: isAdmin, id: viewer?.id ?? null })
        // One happening is written once per person it tells (PAID tells the claimant and the poster); the trail shows it once.
        const rows = every.filter((event, index) => !every.slice(0, index).some((earlier) => earlier.kind === event.kind && earlier.claimId === event.claimId && Math.abs(earlier.createdAt.getTime() - event.createdAt.getTime()) < 1000))
        // Who claimed is between the claimant and CIVIC/ONE until CIVIC/ONE approves the claim, and the poster after that.
        // The public trail says a claim came in, never from whom.
        const shownToPoster = isPoster ? await approvedClaimIds(ctx.db, bounty.id) : new Set<string>()
        return rows.map((event) => {
          const party = event.claimId ? isAdmin || (claim !== null && event.claimId === claim.id) || shownToPoster.has(event.claimId) : isAdmin || isPoster
          const addressed = viewer !== null && (event.recipientId === viewer.id || event.actorId === viewer.id)
          return { ...event, actorId: party || !event.claimId ? event.actorId : null, viewerMaySeeNote: party || addressed }
        })
      },
    }),
    reports: t.field({
      type: [BountyReportRef],
      description: 'Admins only.',
      resolve: async (bounty, _, ctx) => ((await ctx.isAdmin()) ? reportsFor(ctx.db, bounty.id) : []),
    }),
    ledger: t.field({
      type: [LedgerEntryRef],
      description: 'Every movement of money, oldest first. Admins only.',
      resolve: async (bounty, _, ctx) => ((await ctx.isAdmin()) ? ledgerFor(ctx.db, bounty.id) : []),
    }),
    latestPayout: t.field({
      type: LedgerEntryRef,
      nullable: true,
      description: 'The most recent payout attempt. Admins only.',
      resolve: async (bounty, _, ctx) => ((await ctx.isAdmin()) ? latestReleaseFor(ctx.db, bounty.id) : null),
    }),
    frozenFromStatus: t.field({ type: BountyStatus, nullable: true, resolve: (bounty) => bounty.frozenFromStatus }),
    previewImage: t.field({ type: PreviewImageRef, resolve: async (bounty, _, ctx) => previewImage(await bountyCard(bounty, ctx.loaders)) }),
  }),
})

BountyClaimRef.implement({
  description: 'Someone saying they fulfilled a bounty. Visible to the claimant, the poster and admins.',
  fields: (t) => ({
    id: t.exposeID('id'),
    status: t.field({ type: ClaimStatus, resolve: (claim) => claim.status }),
    body: t.exposeString('body'),
    links: t.stringList({ resolve: (claim) => claim.links.split('\n').filter(Boolean) }),
    posterNote: t.string({
      nullable: true,
      description: 'Why the poster objected to the claim, for the reviewer. Poster and admins only.',
      resolve: async (claim, _, ctx) => ((await posterOrAdmin(claim, ctx)) ? claim.posterNote : null),
    }),
    confirmNote: t.string({
      nullable: true,
      description: 'What the poster told the reviewer when confirming. Poster and admins only.',
      resolve: async (claim, _, ctx) => ((await posterOrAdmin(claim, ctx)) ? claim.confirmNote : null),
    }),
    approvedAt: t.field({ type: 'DateTime', nullable: true, description: 'When CIVIC/ONE approved it; the cooling-off period runs from here.', resolve: (claim) => claim.approvedAt }),
    posterAnswerDue: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Until when the poster can confirm or object to an approved claim; after that, silence counts as no objection.',
      resolve: (claim) => (claim.approvedAt ? posterAnswerDue(claim.approvedAt) : null),
    }),
    disputeNote: t.exposeString('disputeNote', { nullable: true }),
    decisionReason: t.field({ type: ClaimDecisionReason, nullable: true, resolve: (claim) => claim.decisionReason }),
    decisionNote: t.exposeString('decisionNote', { nullable: true }),
    createdAt: t.field({ type: 'DateTime', resolve: (claim) => claim.createdAt }),
    confirmedAt: t.field({ type: 'DateTime', nullable: true, resolve: (claim) => claim.confirmedAt }),
    cooldownUntil: t.field({ type: 'DateTime', nullable: true, description: 'Earliest CIVIC/ONE may release the money.', resolve: (claim) => claim.cooldownUntil }),
    rejectedAt: t.field({ type: 'DateTime', nullable: true, resolve: (claim) => claim.rejectedAt }),
    decidedAt: t.field({ type: 'DateTime', nullable: true, resolve: (claim) => claim.decidedAt }),
    bounty: t.field({
      type: BountyRef,
      resolve: async (claim, _, ctx) => {
        const bounty = await ctx.loaders.bounty.load(claim.bountyId)
        if (!bounty) throw new Error(`Bounty ${claim.bountyId} missing`)
        return bounty
      },
    }),
    claimant: t.field({ type: UserRef, nullable: true, resolve: (claim, _, ctx) => (claim.claimantId ? ctx.loaders.user.load(claim.claimantId) : null) }),
    viewerIsClaimant: t.boolean({ resolve: async (claim, _, ctx) => (await ctx.viewer())?.id === claim.claimantId }),
    preflight: t.field({
      type: ReleasePreflightRef,
      nullable: true,
      description: 'What an admin should weigh before paying. Admins only.',
      resolve: async (claim, _, ctx) => {
        if (!(await ctx.isAdmin())) return null
        if (claim.preflight) return JSON.parse(claim.preflight) as ReleasePreflight
        const bounty = await ctx.loaders.bounty.load(claim.bountyId)
        return bounty ? releasePreflight(ctx.db, bounty, claim) : null
      },
    }),
    payoutAccount: t.field({
      type: PayoutAccountRef,
      nullable: true,
      description: 'Where the money goes: the claimant’s current account, or the one it went to. Admins only.',
      resolve: async (claim, _, ctx) => {
        if (!(await ctx.isAdmin()) || !claim.claimantId) return null
        return activePayoutAccount(ctx.db, claim.claimantId)
      },
    }),
  }),
})

BountyEventRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.field({ type: BountyEventKind, resolve: (event) => event.kind }),
    claimId: t.id({ nullable: true, resolve: (event) => event.claimId }),
    byAdmin: t.exposeBoolean('byAdmin'),
    note: t.string({ nullable: true, resolve: (event) => (event.viewerMaySeeNote ? event.note : null) }),
    actor: t.field({
      type: UserRef,
      nullable: true,
      description: 'Null for CIVIC/ONE itself and for admin actions, which are never attributed by name.',
      resolve: (event, _, ctx) => (event.actorId && !event.byAdmin ? ctx.loaders.user.load(event.actorId) : null),
    }),
    createdAt: t.field({ type: 'DateTime', resolve: (event) => event.createdAt }),
  }),
})

BountyReportRef.implement({
  fields: (t) => ({
    reason: t.field({ type: BountyReportReason, resolve: (report) => report.reason }),
    note: t.exposeString('note', { nullable: true }),
    reporter: t.field({ type: UserRef, nullable: true, resolve: (report, _, ctx) => ctx.loaders.user.load(report.reporterId) }),
    createdAt: t.field({ type: 'DateTime', resolve: (report) => report.createdAt }),
  }),
})

LedgerEntryRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    type: t.exposeString('type'),
    status: t.exposeString('status'),
    amountCents: t.exposeInt('amountCents'),
    provider: t.exposeString('provider'),
    reference: t.exposeString('reference'),
    providerRef: t.exposeString('providerRef', { nullable: true }),
    note: t.exposeString('note', { nullable: true }),
    createdAt: t.field({ type: 'DateTime', resolve: (entry) => entry.createdAt }),
    settledAt: t.field({ type: 'DateTime', nullable: true, resolve: (entry) => entry.settledAt }),
  }),
})

PayoutAccountRef.implement({
  description: 'Where a claimant is paid. The account number is never stored; only its last four digits.',
  fields: (t) => ({
    id: t.exposeID('id'),
    bankName: t.exposeString('bankName'),
    bankCode: t.exposeString('bankCode'),
    accountName: t.exposeString('accountName'),
    accountLast4: t.exposeString('accountLast4'),
    status: t.field({ type: PayoutAccountStatus, resolve: (account) => account.status }),
    createdAt: t.field({ type: 'DateTime', resolve: (account) => account.createdAt }),
    readyAt: t.field({ type: 'DateTime', description: 'A new account waits before it can receive money.', resolve: (account) => payoutAccountReadyAt(account.createdAt) }),
  }),
})

BankRef.implement({ fields: (t) => ({ name: t.exposeString('name'), code: t.exposeString('code') }) })

ReleasePreflightRef.implement({
  fields: (t) => ({
    claimantCreatedAfterBounty: t.exposeBoolean('claimantCreatedAfterBounty'),
    claimantHasNoOtherActivity: t.exposeBoolean('claimantHasNoOtherActivity'),
    priorPairings: t.exposeInt('priorPairings'),
    payoutNameMismatch: t.exposeBoolean('payoutNameMismatch'),
    payoutAccountAgeHours: t.exposeInt('payoutAccountAgeHours', { nullable: true }),
    cooldownEndsAt: t.exposeString('cooldownEndsAt', { nullable: true }),
  }),
})

CheckoutRef.implement({
  description: 'A bounty and where to pay for it. The URL is null when the provider couldn’t open a checkout; retry from the bounty page.',
  fields: (t) => ({
    bounty: t.field({ type: BountyRef, resolve: (checkout) => checkout.bounty }),
    checkoutUrl: t.exposeString('checkoutUrl', { nullable: true }),
  }),
})

SweepReportRef.implement({
  fields: (t) => ({
    abandoned: t.exposeInt('abandoned'),
    expired: t.exposeInt('expired'),
    expiring: t.exposeInt('expiring'),
    escalated: t.exposeInt('escalated'),
    redriven: t.exposeInt('redriven'),
    scrubbed: t.exposeInt('scrubbed', { description: 'Texts removed under the privacy policy’s retention periods.' }),
  }),
})

builder.objectFields(UserRef, (t) => ({
  bountyCount: t.int({ description: 'Bounties on the board, open or honoured.', resolve: (user, _, ctx) => countUserBounties(ctx.db, user.id) }),
  bounties: t.connection(
    {
      type: BountyRef,
      description: 'This person’s bounties on the board; all of them to the person themselves.',
      resolve: async (user, args, ctx) => pageUserBounties(ctx.db, user.id, (await ctx.viewer())?.id === user.id || (await ctx.isAdmin()), args),
    },
    BountyConnection,
  ),
  viewerIsAdmin: t.boolean({
    description: 'Whether you review bounties. Only visible to the account owner.',
    resolve: async (user, _, ctx) => (await ctx.viewer())?.id === user.id && (await ctx.isAdmin()),
  }),
  payoutAccount: t.field({
    type: PayoutAccountRef,
    nullable: true,
    description: 'Only visible to the account owner.',
    resolve: async (user, _, ctx) => ((await ctx.viewer())?.id === user.id ? activePayoutAccount(ctx.db, user.id) : null),
  }),
  heldBountyIds: t.idList({
    description: 'Bounties CIVIC/ONE holds money for, which stop the account being deleted. Owner only.',
    resolve: async (user, _, ctx) => ((await ctx.viewer())?.id === user.id ? heldForUser(ctx.db, user.id) : []),
  }),
}))

builder.objectFields(PostRef, (t) => ({
  bounty: t.field({ type: BountyRef, nullable: true, description: 'The bounty raised from this update, while it’s on the board.', resolve: (post, _, ctx) => ctx.loaders.bountyByPost.load(post.id) }),
}))

builder.objectFields(NotificationRef, (t) => ({
  bounty: t.field({ type: BountyRef, nullable: true, resolve: (notification, _, ctx) => (notification.bountyId ? ctx.loaders.bounty.load(notification.bountyId) : null) }),
  bountyEvent: t.field({ type: BountyEventKind, nullable: true, resolve: (notification) => notification.bountyEvent }),
  note: t.string({ nullable: true, resolve: (notification) => notification.note }),
}))

const CreateBountyInput = builder.inputType('CreateBountyInput', {
  fields: (t) => ({
    kind: t.field({ type: BountyKind, required: true }),
    title: t.string({ required: true }),
    body: t.string({ required: true }),
    area: t.string(),
    amountCents: t.int({ required: true, description: `Whole rands, in cents: ${BOUNTY_MIN_CENTS}–${BOUNTY_MAX_CENTS}.` }),
    durationDays: t.int({ required: true }),
    sapsCaseNumber: t.string(),
    postId: t.id({ description: 'Your own update reporting the crime.' }),
    relationship: t.string({ description: 'Missing person: how you know them.' }),
    termsAccepted: t.boolean({ required: true }),
  }),
})

const SubmitClaimInput = builder.inputType('SubmitClaimInput', {
  fields: (t) => ({
    body: t.string({ required: true }),
    links: t.stringList({ description: 'Up to three https links, shown as text.' }),
    attested: t.boolean({ required: true, description: 'You weren’t involved, didn’t buy the item back, and went through SAPS.' }),
  }),
})

const PayoutAccountInput = builder.inputType('PayoutAccountInput', {
  fields: (t) => ({ bankCode: t.string({ required: true }), accountNumber: t.string({ required: true }), accountName: t.string({ required: true }) }),
})

builder.queryFields((t) => ({
  bounties: t.connection(
    {
      type: BountyRef,
      description: 'The board: open bounties, or with `honoured`, the paid ones. Newest first.',
      args: { kind: t.arg({ type: BountyKind }), honoured: t.arg.boolean() },
      resolve: (_root, args, ctx) => pageBoard(ctx.db, { kind: args.kind, honoured: args.honoured }, args),
    },
    BountyConnection,
  ),
  bounty: t.field({
    type: BountyRef,
    nullable: true,
    description: 'Null if it doesn’t exist or you may not see it.',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, { id }, ctx) => {
      const bounty = await bountyById(ctx.db, String(id))
      if (!bounty) return null
      const { viewer, isAdmin, claim } = await access(bounty, ctx)
      return canSeeBounty(bounty, viewer, isAdmin, claim !== null) ? bounty : null
    },
  }),
  myBounties: t.connection(
    { type: BountyRef, description: 'Everything you posted, newest first.', resolve: async (_root, args, ctx) => pageMyBounties(ctx.db, (await ctx.requireViewer()).id, args) },
    BountyConnection,
  ),
  myClaims: t.connection(
    { type: BountyClaimRef, description: 'Everything you claimed, newest first.', resolve: async (_root, args, ctx) => pageMyClaims(ctx.db, (await ctx.requireViewer()).id, args) },
    BountyClaimConnection,
  ),
  bountyQueue: t.connection(
    {
      type: BountyRef,
      description: 'Bounties that need an admin: reviews, confirmed claims, disputes, failed payouts, holds, reports and cancellation requests.',
      resolve: async (_root, args, ctx) => {
        await ctx.requireAdmin()
        return pageAdminQueue(ctx.db, args)
      },
    },
    BountyConnection,
  ),
  banks: t.field({
    type: [BankRef],
    description: 'Banks a payout account can be at.',
    resolve: (_root, _args, ctx) => ctx.payments.provider?.listBanks() ?? [],
  }),
  paymentsStatus: t.field({
    type: PaymentsStatus,
    resolve: (_root, _args, ctx) => {
      const provider = ctx.payments.provider
      if (!provider) return 'DISABLED'
      if (provider.name === 'sandbox') return 'SANDBOX'
      return provider.mode === 'LIVE' ? 'PAYSTACK_LIVE' : 'PAYSTACK_TEST'
    },
  }),
}))

builder.mutationFields((t) => ({
  createBounty: t.field({
    type: CheckoutRef,
    description: 'Creates the bounty and opens a checkout for it. It’s listed once the payment settles.',
    args: { input: t.arg({ type: CreateBountyInput, required: true }) },
    resolve: async (_root, { input }, ctx) =>
      createBounty(money(ctx), await ctx.requireViewer(), {
        kind: input.kind,
        title: input.title,
        body: input.body,
        area: input.area,
        amountCents: input.amountCents,
        durationDays: input.durationDays,
        sapsCaseNumber: input.sapsCaseNumber,
        postId: input.postId == null ? null : String(input.postId),
        relationship: input.relationship,
        termsAccepted: input.termsAccepted as true,
      }),
  }),
  retryBountyCheckout: t.field({
    type: CheckoutRef,
    description: 'A new checkout for a bounty that hasn’t been paid for.',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, { id }, ctx) => retryCheckout(money(ctx), await ctx.requireViewer(), String(id)),
  }),
  confirmBountyPayment: t.field({
    type: BountyRef,
    description: 'Asks the provider whether the checkout went through (the return page calls this; the webhook may already have).',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, { id }, ctx) => confirmPayment(money(ctx), await ctx.requireViewer(), String(id)),
  }),
  cancelBounty: t.field({
    type: BountyRef,
    description: 'Refunds and closes your bounty. Not while a claim is waiting; ask CIVIC/ONE instead.',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, { id }, ctx) => cancelBounty(money(ctx), await ctx.requireViewer(), String(id)),
  }),
  requestBountyCancellation: t.field({
    type: BountyRef,
    args: { id: t.arg.id({ required: true }), note: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => requestCancellation(money(ctx), await ctx.requireViewer(), String(args.id), args.note),
  }),
  submitClaim: t.field({
    type: BountyClaimRef,
    args: { bountyId: t.arg.id({ required: true }), input: t.arg({ type: SubmitClaimInput, required: true }) },
    resolve: async (_root, { bountyId, input }, ctx) =>
      submitClaim(money(ctx), await ctx.requireViewer(), String(bountyId), { body: input.body, links: input.links ?? [], attested: input.attested as true }),
  }),
  withdrawClaim: t.field({
    type: BountyClaimRef,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, { id }, ctx) => withdrawClaim(money(ctx), await ctx.requireViewer(), String(id)),
  }),
  confirmClaim: t.field({
    type: BountyClaimRef,
    description: 'The poster confirms the outcome of a claim CIVIC/ONE approved. CIVIC/ONE pays after the cooling-off period.',
    args: { id: t.arg.id({ required: true }), note: t.arg.string() },
    resolve: async (_root, args, ctx) => confirmClaim(money(ctx), await ctx.requireViewer(), String(args.id), args.note),
  }),
  objectToClaim: t.field({
    type: BountyClaimRef,
    description: 'The poster objects to a claim CIVIC/ONE approved, with a reason for the reviewer. CIVIC/ONE decides, and may pay anyway.',
    args: { id: t.arg.id({ required: true }), note: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => objectToClaim(money(ctx), await ctx.requireViewer(), String(args.id), args.note),
  }),
  setPayoutAccount: t.field({
    type: PayoutAccountRef,
    description: 'The bank account your bounty payouts go to. A new account waits before it can receive money.',
    args: { input: t.arg({ type: PayoutAccountInput, required: true }) },
    resolve: async (_root, { input }, ctx) => setPayoutAccount(money(ctx), await ctx.requireViewer(), input),
  }),
  reportBounty: t.field({
    type: BountyRef,
    args: { id: t.arg.id({ required: true }), reason: t.arg({ type: BountyReportReason, required: true }), note: t.arg.string() },
    resolve: async (_root, args, ctx) => reportBounty(money(ctx), await ctx.requireViewer(), String(args.id), { reason: args.reason, note: args.note }),
  }),

  // Admin.
  decideClaim: t.field({
    type: BountyClaimRef,
    description: 'Approves a new claim, verifies (and pays) one the poster answered, or rejects. Admins only.',
    args: { id: t.arg.id({ required: true }), decision: t.arg({ type: ClaimDecision, required: true }), reason: t.arg({ type: ClaimDecisionReason, required: true }), note: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => decideClaim(money(ctx), await ctx.requireAdmin(), String(args.id), args.decision, args.reason, args.note),
  }),
  retryBountyPayout: t.field({
    type: BountyRef,
    description: 'Sends a failed payout again, to the claimant’s current account, under the same checks as the first time. Admins only.',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, { id }, ctx) => retryPayout(money(ctx), await ctx.requireAdmin(), String(id)),
  }),
  retryBountyRefund: t.field({
    type: BountyRef,
    description: 'Sends a refund the provider failed again, to the same card. Admins only.',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, { id }, ctx) => retryRefund(money(ctx), await ctx.requireAdmin(), String(id)),
  }),
  approveBounty: t.field({
    type: BountyRef,
    args: { id: t.arg.id({ required: true }), note: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => approveBounty(money(ctx), await ctx.requireAdmin(), String(args.id), args.note),
  }),
  declineBounty: t.field({
    type: BountyRef,
    args: { id: t.arg.id({ required: true }), note: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => declineBounty(money(ctx), await ctx.requireAdmin(), String(args.id), args.note),
  }),
  adminCancelBounty: t.field({
    type: BountyRef,
    description: 'Closes and refunds a bounty from the review side. With `takeDown`, its page stays off everyone’s screen but the poster’s, claimants’ and admins’.',
    args: { id: t.arg.id({ required: true }), note: t.arg.string({ required: true }), takeDown: t.arg.boolean() },
    resolve: async (_root, args, ctx) => adminCancelBounty(money(ctx), await ctx.requireAdmin(), String(args.id), args.note, args.takeDown ?? false),
  }),
  freezeBounty: t.field({
    type: BountyRef,
    args: { id: t.arg.id({ required: true }), note: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => freezeBounty(money(ctx), await ctx.requireAdmin(), String(args.id), args.note),
  }),
  unfreezeBounty: t.field({
    type: BountyRef,
    args: { id: t.arg.id({ required: true }), note: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => unfreezeBounty(money(ctx), await ctx.requireAdmin(), String(args.id), args.note),
  }),
  sweepBounties: t.field({
    type: SweepReportRef,
    description: 'Runs the hourly sweep now: expiries, abandoned checkouts, silent posters, pending money. Admins only.',
    resolve: async (_root, _args, ctx) => {
      await ctx.requireAdmin()
      return sweep(money(ctx))
    },
  }),

  /**
   * Local and test only. Always in the schema (one persisted manifest for every
   * stage); anywhere but the sandbox it refuses.
   */
  sandboxCompleteCheckout: t.field({
    type: BountyRef,
    description: 'Sandbox only: pretends the checkout was paid (or failed).',
    args: { id: t.arg.id({ required: true }), outcome: t.arg.string({ defaultValue: 'SUCCESS' }) },
    resolve: async (_root, args, ctx) => {
      const viewer = await ctx.requireViewer()
      const provider = ctx.payments.provider
      if (!provider || provider.name !== 'sandbox') throw apiError('FORBIDDEN', 'Only the sandbox can pretend to pay')
      const bounty = await bountyById(ctx.db, String(args.id))
      if (!bounty || bounty.posterId !== viewer.id) throw apiError('NOT_FOUND', 'Bounty not found')
      const outcome = args.outcome === 'FAILED' || args.outcome === 'WRONG_AMOUNT' ? args.outcome : 'SUCCESS'
      const [entry] = await ctx.db.query.ledgerEntries.findMany({
        where: (ledger, { and, eq, inArray }) => and(eq(ledger.bountyId, bounty.id), eq(ledger.type, 'DEPOSIT'), inArray(ledger.status, ['PENDING', 'SETTLED'])),
      })
      if (!entry) throw apiError('BAD_USER_INPUT', 'Nothing to pay for')
      const sandbox = provider as import('../payments/sandbox').SandboxProvider
      sandbox.complete(entry.reference, outcome)
      const verified = await provider.verifyCheckout(entry.reference)
      return verified ? settleDeposit(money(ctx), entry.reference, verified) : bounty
    },
  }),
}))

export const _types = { CheckoutRef, UserRef } as const
export type { User }
