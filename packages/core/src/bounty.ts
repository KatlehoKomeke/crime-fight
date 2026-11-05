/*
 * Bounties: a reward, paid in up front and held by CIVIC/ONE, for a verifiable
 * outcome. Every number and label here is shared by the API (validation, state
 * machine, sweeper), the app (copy) and the terms of use, so they never disagree.
 */

export const BOUNTY_KINDS = ['PROPERTY', 'MISSING_PERSON', 'INFORMATION'] as const
export type BountyKind = (typeof BOUNTY_KINDS)[number]

export const BOUNTY_STATUSES = [
  /** Created; the poster hasn't paid yet. Not listed. */
  'PENDING_PAYMENT',
  /** Paid; a missing-person (or reported) bounty an admin must approve before it's listed. */
  'PENDING_REVIEW',
  /** Listed and taking claims. */
  'OPEN',
  /** The poster confirmed a claim; an admin verifies it after the cooling-off period. New claims pause. */
  'AWAITING_VERIFICATION',
  /** Verified; the payout has been sent to the claimant's bank and hasn't settled yet. */
  'RELEASING',
  /** The payout settled. */
  'PAID',
  /** Refunded to the poster, by the poster (no live claims) or an admin. */
  'CANCELLED',
  /** Ran out of time with no confirmed claim; refunded. */
  'EXPIRED',
  /** Never paid for within the payment window. */
  'ABANDONED',
  /** Admin hold (report, chargeback). Hidden; nothing moves until unfrozen. */
  'FROZEN',
] as const
export type BountyStatus = (typeof BOUNTY_STATUSES)[number]

/** Statuses in which CIVIC/ONE holds the poster's money. */
export const BOUNTY_FUNDED_STATUSES: readonly BountyStatus[] = ['PENDING_REVIEW', 'OPEN', 'AWAITING_VERIFICATION', 'RELEASING', 'FROZEN']
/** Statuses shown on the public board (PAID stays listed as "Honoured"). */
export const BOUNTY_LISTED_STATUSES: readonly BountyStatus[] = ['OPEN', 'AWAITING_VERIFICATION', 'RELEASING', 'PAID']
/** Nothing changes after these. */
export const BOUNTY_CLOSED_STATUSES: readonly BountyStatus[] = ['PAID', 'CANCELLED', 'EXPIRED', 'ABANDONED']

export const CLAIM_STATUSES = [
  'SUBMITTED',
  /** The poster says the outcome happened. The admin decides after the cooling-off period. */
  'CONFIRMED',
  /** The poster said no, with a reason; the claimant may dispute once. */
  'REJECTED_BY_POSTER',
  /** With the admin: the claimant disputed, or the poster never answered. */
  'DISPUTED',
  /** The admin verified it; the payout is on its way. */
  'VERIFIED',
  'PAID',
  /** The admin rejected it, with a reason. */
  'REJECTED',
  'WITHDRAWN',
] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]

/** Claims that stop the poster cancelling and keep the bounty alive. */
export const CLAIM_LIVE_STATUSES: readonly ClaimStatus[] = ['SUBMITTED', 'CONFIRMED', 'DISPUTED', 'VERIFIED']

export const CLAIM_DECISION_REASONS = [
  'VERIFIED',
  'NOT_ENOUGH_EVIDENCE',
  'OUTCOME_NOT_MET',
  'INVOLVED',
  'NOT_VIA_SAPS',
  'DUPLICATE',
  'SAFETY',
  'TERMS_BREACH',
  'LEGAL_HOLD',
  'OTHER_CLAIM_PAID',
  'BOUNTY_CLOSED',
  'ADMIN_OVERRIDE',
] as const
export type ClaimDecisionReason = (typeof CLAIM_DECISION_REASONS)[number]

/** One sentence both parties see, so a decision never needs explaining twice. */
export const CLAIM_DECISION_LABEL: Record<ClaimDecisionReason, string> = {
  VERIFIED: 'Verified: the outcome the bounty asked for happened.',
  NOT_ENOUGH_EVIDENCE: 'Not enough evidence that the outcome happened.',
  OUTCOME_NOT_MET: 'What was described doesn’t meet what the bounty asked for.',
  INVOLVED: 'The claimant appears to have been involved in the crime or in holding the property.',
  NOT_VIA_SAPS: 'The property or information didn’t go through SAPS as the rules require.',
  DUPLICATE: 'The same outcome was already claimed.',
  SAFETY: 'The claim describes an unsafe recovery or confrontation. CIVIC/ONE doesn’t pay for those.',
  TERMS_BREACH: 'The claim breaks the terms of use.',
  LEGAL_HOLD: 'On hold at the request of SAPS or a court.',
  OTHER_CLAIM_PAID: 'Another claim on this bounty was verified and paid.',
  BOUNTY_CLOSED: 'The bounty was closed before this claim was decided.',
  ADMIN_OVERRIDE: 'Verified by CIVIC/ONE after reviewing the poster’s rejection.',
}

export const BOUNTY_EVENT_KINDS = [
  'CREATED',
  'FUNDED',
  'APPROVED',
  'DECLINED',
  'CLAIM_SUBMITTED',
  'CLAIM_WITHDRAWN',
  'CLAIM_CONFIRMED',
  'CLAIM_REJECTED_BY_POSTER',
  'CLAIM_DISPUTED',
  'CLAIM_ESCALATED',
  'CLAIM_VERIFIED',
  'CLAIM_REJECTED',
  'PAYOUT_SENT',
  'PAYOUT_FAILED',
  'PAID',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'EXPIRING',
  'EXPIRED',
  'REFUNDED',
  'REFUND_FAILED',
  'FROZEN',
  'UNFROZEN',
  'REPORTED',
  'CHARGEBACK',
] as const
export type BountyEventKind = (typeof BOUNTY_EVENT_KINDS)[number]

export const BOUNTY_REPORT_REASONS = ['TARGETS_A_PERSON', 'NOT_MISSING', 'SCAM', 'PERSONAL_INFORMATION', 'OTHER'] as const
export type BountyReportReason = (typeof BOUNTY_REPORT_REASONS)[number]

export const BOUNTY_REPORT_LABEL: Record<BountyReportReason, string> = {
  TARGETS_A_PERSON: 'It targets a person, not an outcome',
  NOT_MISSING: 'The person isn’t missing',
  SCAM: 'It looks like a scam',
  PERSONAL_INFORMATION: 'It shares someone’s personal information',
  OTHER: 'Something else',
}

export const LEDGER_TYPES = ['DEPOSIT', 'RELEASE', 'REFUND', 'REVERSAL', 'CHARGEBACK', 'CHARGEBACK_REVERSED'] as const
export type LedgerType = (typeof LEDGER_TYPES)[number]
export const LEDGER_STATUSES = ['PENDING', 'SETTLED', 'FAILED', 'MISMATCH'] as const
export type LedgerStatus = (typeof LEDGER_STATUSES)[number]
export const PAYOUT_ACCOUNT_STATUSES = ['ACTIVE', 'REPLACED'] as const
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number]

/* Limits. Rands are stored as cents; amounts are whole rands by construction. */
export const BOUNTY_CURRENCY = 'ZAR'
export const BOUNTY_MIN_CENTS = 200_00
/** While CIVIC/ONE is not a licensed payment provider: see docs/adr/0006-bounties.md. */
export const BOUNTY_MAX_CENTS = 50_000_00
/** Held across all of one poster's open bounties. */
export const BOUNTY_HELD_MAX_CENTS = 100_000_00
export const BOUNTY_OPEN_MAX_PER_POSTER = 3
export const BOUNTY_TITLE_MAX = 80
export const BOUNTY_BODY_MIN = 40
export const BOUNTY_BODY_MAX = 1500
export const CLAIM_BODY_MIN = 40
export const CLAIM_BODY_MAX = 2000
export const CLAIM_LINKS_MAX = 3
export const CLAIMS_PER_DAY_MAX = 5
export const BOUNTY_NOTE_MAX = 500
export const BOUNTY_DURATIONS_DAYS = [30, 60, 90] as const
export const BOUNTY_DEFAULT_DURATION_DAYS = 30
export const MISSING_PERSON_MAX_DAYS = 30
/** Days the poster has to answer a claim before it goes to an admin. */
export const CLAIM_POSTER_RESPONSE_DAYS = 14
export const CLAIM_POSTER_REMINDER_DAYS = 7
/** Days a claimant has to dispute a poster's rejection. */
export const CLAIM_DISPUTE_DAYS = 7
/** A new payout account can't receive money until this long after it was added. */
export const PAYOUT_ACCOUNT_HOLD_HOURS = 72
/** An unpaid bounty is abandoned after this. */
export const PENDING_PAYMENT_TTL_HOURS = 24
/** Days before expiry the poster is reminded. */
export const BOUNTY_EXPIRING_DAYS = 3

export interface BountyKindRule {
  label: string
  /** Shown as the kind chip and in lists. */
  short: string
  /** What has to happen for the bounty to be honoured. */
  fulfilled: string
  /** What a claim must include. */
  evidence: string
  requiresCaseNumber: boolean
  /** Hours between the poster confirming a claim and an admin being able to release the money. */
  cooldownHours: number
  maxDays: number
  titlePlaceholder: string
  bodyPlaceholder: string
}

export const BOUNTY_KIND_RULES: Record<BountyKind, BountyKindRule> = {
  PROPERTY: {
    label: 'Stolen vehicle or property',
    short: 'Property',
    fulfilled: 'The vehicle or item is back with you, handed over through SAPS or in a way SAPS knows about.',
    evidence: 'Where and how it was recovered, the SAPS station or case it went through, and anything that shows it is the same item.',
    requiresCaseNumber: false,
    cooldownHours: 72,
    maxDays: 90,
    titlePlaceholder: 'White 2019 Toyota Hilux, CA 123-456, taken from Albert Road',
    bodyPlaceholder: 'What it is, where and when it was taken, and what would identify it. Don’t name anyone you suspect.',
  },
  MISSING_PERSON: {
    label: 'Missing person',
    short: 'Missing person',
    fulfilled: 'The person is found safe and SAPS confirms it. Sightings go to SAPS, never here.',
    evidence: 'The station you reported the sighting to and when. Never where the person is.',
    requiresCaseNumber: true,
    cooldownHours: 72,
    maxDays: MISSING_PERSON_MAX_DAYS,
    titlePlaceholder: 'Missing: Sipho, 34, last seen in Observatory on 3 November',
    bodyPlaceholder: 'When and where they were last seen, what they were wearing, and the SAPS case number. No home address.',
  },
  INFORMATION: {
    label: 'Information for SAPS',
    short: 'Information',
    fulfilled: 'Information given to SAPS leads to an arrest or a charge in the case. SAPS confirms it; you don’t investigate.',
    evidence: 'The station and officer you spoke to, when, and the case number. Not the information itself.',
    requiresCaseNumber: true,
    cooldownHours: 7 * 24,
    maxDays: 90,
    titlePlaceholder: 'Information on the Woodstock bakery break-in, CAS 102/11/2026',
    bodyPlaceholder: 'What happened, where and when, and the SAPS case number. Don’t name or describe a suspect.',
  },
}

export const BOUNTY_STATUS_LABEL: Record<BountyStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PENDING_REVIEW: 'Awaiting review',
  OPEN: 'Open',
  AWAITING_VERIFICATION: 'Under review',
  RELEASING: 'Payout in progress',
  PAID: 'Honoured',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  ABANDONED: 'Not funded',
  FROZEN: 'On hold',
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  SUBMITTED: 'Waiting for the poster',
  CONFIRMED: 'Confirmed by the poster',
  REJECTED_BY_POSTER: 'Rejected by the poster',
  DISPUTED: 'With CIVIC/ONE',
  VERIFIED: 'Verified',
  PAID: 'Paid',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
}

/**
 * "R5 000", "R1 234,56". Hand-rolled so Hermes, Node and browsers agree to
 * the byte (Intl inserts locale-specific spaces that break hydration).
 */
export function formatZar(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  const rands = Math.floor(abs / 100)
  const remainder = abs % 100
  const grouped = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negative ? '−' : ''}R${grouped}${remainder ? `,${String(remainder).padStart(2, '0')}` : ''}`
}

/** "CAS 123/11/2026" as SAPS writes it, or null if it doesn't look like a case number. */
export function normaliseCaseNumber(raw: string): string | null {
  const match = /^\s*(?:cas\s*)?(\d{1,6})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*$/i.exec(raw)
  if (!match) return null
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return `CAS ${Number(match[1])}/${String(month).padStart(2, '0')}/${match[3]}`
}

export const bountyExpiresAt = (fundedAt: Date, durationDays: number) => new Date(fundedAt.getTime() + durationDays * 24 * 60 * 60_000)
export const claimCooldownEnds = (confirmedAt: Date, kind: BountyKind) => new Date(confirmedAt.getTime() + BOUNTY_KIND_RULES[kind].cooldownHours * 60 * 60_000)
export const payoutAccountReadyAt = (createdAt: Date) => new Date(createdAt.getTime() + PAYOUT_ACCOUNT_HOLD_HOURS * 60 * 60_000)

/** Mentions are refused in bounty text: a bounty names an outcome, never a person. */
export const MENTION = /(^|[^\w@])@[A-Za-z0-9_]{2,30}/

export const BOUNTY_RULES_SUMMARY = [
  'You pay the reward in before the bounty is listed. CIVIC/ONE holds it; it isn’t spent, lent or invested.',
  'Nobody is named. A bounty describes a vehicle, an item, a missing person or a case, never a suspect.',
  'Property comes back through SAPS. Never buy it back from whoever has it.',
  'Information goes to SAPS first; the bounty rewards what SAPS can use.',
  'You confirm a claim; CIVIC/ONE verifies it after a cooling-off period and pays the claimant’s bank account.',
  'You can cancel for a full refund at any time until someone claims. After that, ask us and we’ll decide.',
] as const
