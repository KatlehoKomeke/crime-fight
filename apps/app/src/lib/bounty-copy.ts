import {
  BOUNTY_KIND_RULES,
  BOUNTY_STATUS_LABEL,
  type BountyEventKind,
  type BountyKind,
  type BountyStatus,
  CLAIM_DECISION_LABEL,
  CLAIM_STATUS_LABEL,
  type ClaimDecisionReason,
  type ClaimStatus,
  formatZar,
} from '@civic/core'
import type { Palette } from '@/theme'

/*
 * Words and colours for bounty states, shared by rows, status strips, cards
 * and notifications so a status never reads differently on two screens.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_MS = 24 * 60 * 60_000

/** "4 December 2026". Hand-rolled so the server and every device agree to the byte. */
export function formatDate(value: string | Date): string {
  const date = new Date(value)
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** "4 December 2026, 14:05". */
export function formatDateTime(value: string | Date): string {
  const date = new Date(value)
  return `${formatDate(date)}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Whole days from now until `value`; negative once it has passed. */
export const daysUntil = (value: string | Date, now = new Date()) => Math.ceil((new Date(value).getTime() - now.getTime()) / DAY_MS)

/** "Ends in 12 days", "Ends today", "Ended". */
export function timeLeft(expiresAt: string | Date, now = new Date()): string {
  const days = daysUntil(expiresAt, now)
  if (days < 0) return 'Ended'
  if (days === 0) return 'Ends today'
  if (days === 1) return 'Ends tomorrow'
  return `Ends in ${days} days`
}

/** "in 3 hours", "in 2 days", "now". */
export function timeUntil(value: string | Date, now = new Date()): string {
  const ms = new Date(value).getTime() - now.getTime()
  if (ms <= 0) return 'now'
  const hours = Math.ceil(ms / 3_600_000)
  if (hours < 24) return `in ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.ceil(ms / DAY_MS)
  return `in ${days} ${days === 1 ? 'day' : 'days'}`
}

export const kindLabel = (kind: BountyKind) => BOUNTY_KIND_RULES[kind].short

export type StatusTone = 'open' | 'busy' | 'done' | 'muted' | 'danger'

export function bountyTone(status: BountyStatus, isExpired = false): StatusTone {
  switch (status) {
    case 'OPEN':
      return isExpired ? 'muted' : 'open'
    case 'PENDING_PAYMENT':
    case 'PENDING_REVIEW':
    case 'AWAITING_VERIFICATION':
    case 'RELEASING':
      return 'busy'
    case 'PAID':
      return 'done'
    case 'FROZEN':
      return 'danger'
    default:
      return 'muted'
  }
}

export function claimTone(status: ClaimStatus): StatusTone {
  switch (status) {
    case 'SUBMITTED':
    case 'CONFIRMED':
    case 'DISPUTED':
      return 'busy'
    case 'VERIFIED':
    case 'PAID':
      return 'done'
    case 'REJECTED':
    case 'REJECTED_BY_POSTER':
      return 'danger'
    default:
      return 'muted'
  }
}

export function toneColor(tone: StatusTone, c: Palette): string {
  switch (tone) {
    case 'open':
    case 'done':
      return c.accentText
    case 'busy':
      return c.warning
    case 'danger':
      return c.danger
    default:
      return c.textMuted
  }
}

export const bountyStatusLabel = (bounty: { status: BountyStatus; isExpired: boolean }) => (bounty.isExpired ? 'Closing' : BOUNTY_STATUS_LABEL[bounty.status])

/** One line about where the bounty stands, for rows and the status strip. */
export function bountyStatusLine(bounty: { status: BountyStatus; isExpired: boolean; expiresAt?: string | null; closedAt?: string | null }): string {
  switch (bounty.status) {
    case 'OPEN':
      return bounty.isExpired ? 'Out of time; being refunded' : bounty.expiresAt ? timeLeft(bounty.expiresAt) : 'Open'
    case 'PENDING_PAYMENT':
      return 'Not paid for yet'
    case 'PENDING_REVIEW':
      return 'Not public until CIVIC/ONE approves it'
    case 'AWAITING_VERIFICATION':
      return 'A claim is being verified'
    case 'RELEASING':
      return 'The reward is on its way to the claimant'
    case 'PAID':
      return bounty.closedAt ? `Honoured ${formatDate(bounty.closedAt)}` : 'Honoured'
    case 'CANCELLED':
    case 'EXPIRED':
      return 'Refunded to the poster'
    case 'ABANDONED':
      return 'Never paid for'
    case 'FROZEN':
      return 'On hold while CIVIC/ONE reviews it'
  }
}

export const claimStatusLabel = (status: ClaimStatus) => CLAIM_STATUS_LABEL[status]
export const decisionLabel = (reason: ClaimDecisionReason | null | undefined) => (reason ? CLAIM_DECISION_LABEL[reason] : null)

const quoted = (title: string) => `“${title}”`

/** What a bounty notification says, from the event and the bounty it's about. */
export function bountyNotificationText(event: BountyEventKind, bounty: { title: string; amountCents: number }): string {
  const amount = formatZar(bounty.amountCents)
  const title = quoted(bounty.title)
  switch (event) {
    case 'CREATED':
      return `You posted ${title}`
    case 'FUNDED':
      return `Your ${amount} bounty ${title} is live`
    case 'APPROVED':
      return `${title} was approved and is now listed`
    case 'DECLINED':
      return `We couldn’t list ${title}. The full amount is being refunded.`
    case 'CLAIM_SUBMITTED':
      return `Someone sent a claim on your ${amount} bounty ${title}`
    case 'CLAIM_WITHDRAWN':
      return `A claim on your ${amount} bounty ${title} was withdrawn`
    case 'CLAIM_CONFIRMED':
      return `The poster confirmed your claim on ${title}. CIVIC/ONE verifies it next.`
    case 'CLAIM_REJECTED_BY_POSTER':
      return `The poster declined your claim on ${title}. You can ask CIVIC/ONE to review it.`
    case 'CLAIM_DISPUTED':
      return `A claim on your bounty ${title} is with CIVIC/ONE to decide`
    case 'CLAIM_ESCALATED':
      return `A claim on ${title} went to CIVIC/ONE because it wasn’t answered in time`
    case 'CLAIM_VERIFIED':
      return `Your claim on ${title} was verified. ${amount} is on its way.`
    case 'CLAIM_REJECTED':
      return `Your claim on ${title} wasn’t accepted`
    case 'PAYOUT_SENT':
      return `${amount} has been sent to your bank account for ${title}`
    case 'PAYOUT_FAILED':
      return `We couldn’t pay ${amount} to your bank account. Check it in Settings.`
    case 'PAID':
      return `${amount} has been paid for ${title}`
    case 'CANCEL_REQUESTED':
      return `The poster asked to cancel ${title}`
    case 'CANCELLED':
      return `${title} was cancelled. The full amount is being refunded.`
    case 'EXPIRING':
      return `Your bounty ${title} ends in a few days`
    case 'EXPIRED':
      return `${title} ran out of time. The full amount is being refunded.`
    case 'REFUNDED':
      return `${amount} was refunded for ${title}`
    case 'REFUND_FAILED':
      return `We couldn’t refund ${amount} for ${title}. We’re looking into it.`
    case 'FROZEN':
      return `${title} is on hold while CIVIC/ONE reviews it`
    case 'UNFROZEN':
      return `${title} is back on the board`
    case 'REPORTED':
      return `${title} was reported`
    case 'CHARGEBACK':
      return `A payment dispute was opened on ${title}`
  }
}

/** The activity trail's wording for an event, in the poster's or the public's words. */
export function bountyEventText(event: BountyEventKind): string {
  switch (event) {
    case 'CREATED':
      return 'Bounty created'
    case 'FUNDED':
      return 'Reward paid in and held by CIVIC/ONE'
    case 'APPROVED':
      return 'Approved and listed by CIVIC/ONE'
    case 'DECLINED':
      return 'Not listed by CIVIC/ONE'
    case 'CLAIM_SUBMITTED':
      return 'A claim was submitted'
    case 'CLAIM_WITHDRAWN':
      return 'A claim was withdrawn'
    case 'CLAIM_CONFIRMED':
      return 'The poster confirmed a claim'
    case 'CLAIM_REJECTED_BY_POSTER':
      return 'The poster declined a claim'
    case 'CLAIM_DISPUTED':
      return 'A claimant asked CIVIC/ONE to review a decision'
    case 'CLAIM_ESCALATED':
      return 'A claim went to CIVIC/ONE: the poster didn’t answer in time'
    case 'CLAIM_VERIFIED':
      return 'Verified by CIVIC/ONE'
    case 'CLAIM_REJECTED':
      return 'A claim was rejected by CIVIC/ONE'
    case 'PAYOUT_SENT':
      return 'Payout sent to the claimant’s bank'
    case 'PAYOUT_FAILED':
      return 'The payout failed; CIVIC/ONE is retrying'
    case 'PAID':
      return 'Honoured: the reward was paid'
    case 'CANCEL_REQUESTED':
      return 'The poster asked to cancel'
    case 'CANCELLED':
      return 'Cancelled and refunded'
    case 'EXPIRING':
      return 'Ending soon'
    case 'EXPIRED':
      return 'Expired and refunded'
    case 'REFUNDED':
      return 'Refunded to the poster'
    case 'REFUND_FAILED':
      return 'The refund failed; CIVIC/ONE is retrying'
    case 'FROZEN':
      return 'Put on hold by CIVIC/ONE'
    case 'UNFROZEN':
      return 'Hold released'
    case 'REPORTED':
      return 'Reported'
    case 'CHARGEBACK':
      return 'Payment dispute with the poster’s bank'
  }
}
