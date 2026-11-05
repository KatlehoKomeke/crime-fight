import {
  BOUNTY_REPORT_LABEL,
  BOUNTY_STATUS_LABEL,
  CLAIM_DECISION_LABEL,
  CLAIM_DECISION_REASONS,
  type ClaimDecisionReason,
  formatRelativeTime,
  formatZar,
  PAYOUT_ACCOUNT_HOLD_HOURS,
} from '@civic/core'
import type { BountyDetailFieldsFragment } from '@civic/graphql'
import { Link } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { type CombinedError, useMutation } from 'urql'
import { AdminCancelBounty, ApproveBounty, DecideClaim, DeclineBounty, FreezeBounty, RetryBountyPayout, RetryBountyRefund, UnfreezeBounty } from '@/graphql/documents'
import { claimStatusLabel, claimTone, decisionLabel, formatDate, formatDateTime, timeUntil, toneColor } from '@/lib/bounty-copy'
import { profilePath } from '@/lib/profile'
import { fonts, radius, useColors } from '@/theme'
import { ConfirmDialog } from '../ConfirmDialog'
import { Icon } from '../Icon'
import { useToast } from '../Toast'
import { Button, Checkbox, Chip, Row, Section, Txt } from '../ui'
import { ClaimantRow, ClaimText, inFuture, NoteDialog } from './ClaimCard'

type Bounty = BountyDetailFieldsFragment
type Claim = Bounty['claims'][number]
type Outcome = { error?: CombinedError }

/** Reasons an admin can reject for: the others are recorded by the system or belong to verifying. */
const REJECT_REASONS = CLAIM_DECISION_REASONS.filter((reason) => !['VERIFIED', 'ADMIN_OVERRIDE', 'OTHER_CLAIM_PAID', 'BOUNTY_CLOSED'].includes(reason))

/** Short chip labels; the full sentence both parties will see is shown under the chips. */
const REASON_SHORT: Partial<Record<ClaimDecisionReason, string>> = {
  NOT_ENOUGH_EVIDENCE: 'Not enough evidence',
  OUTCOME_NOT_MET: 'Outcome not met',
  INVOLVED: 'Involved',
  NOT_VIA_SAPS: 'Not via SAPS',
  DUPLICATE: 'Duplicate',
  SAFETY: 'Unsafe',
  TERMS_BREACH: 'Terms breach',
  LEGAL_HOLD: 'Legal hold',
}

const DECIDABLE = ['AWAITING_VERIFICATION', 'OPEN']

/** Everything a reviewer weighs before money moves: facts, reports, the ledger, each claim with its signals, and the admin actions. */
export function AdminCard({ bounty }: { bounty: Bounty }) {
  return (
    <Section title="Review (CIVIC/ONE)">
      <Facts bounty={bounty} />
      {bounty.claims.map((claim) => (
        <AdminClaim key={claim.id} claim={claim} bounty={bounty} />
      ))}
      <BountyActions bounty={bounty} />
    </Section>
  )
}

function Facts({ bounty }: { bounty: Bounty }) {
  const c = useColors()
  const status = bounty.status === 'FROZEN' && bounty.frozenFromStatus ? `${BOUNTY_STATUS_LABEL.FROZEN} (was ${BOUNTY_STATUS_LABEL[bounty.frozenFromStatus]})` : BOUNTY_STATUS_LABEL[bounty.status]
  return (
    <>
      <Row label="Status" value={status} />
      <Row label="Amount" value={formatZar(bounty.amountCents)} hint={bounty.fundedAt ? `Paid in ${formatDateTime(bounty.fundedAt)}` : 'Not paid in'} />
      <Row label="Poster">
        {bounty.poster ? (
          <Link href={profilePath(bounty.poster.handle)} style={[styles.link, { color: c.accentText }]}>
            @{bounty.poster.handle}
          </Link>
        ) : (
          <Txt variant="bodyStrong">A former member</Txt>
        )}
      </Row>
      {bounty.kind === 'MISSING_PERSON' ? <Row label="Relationship to the person" value={bounty.relationship ?? 'Not given'} /> : null}
      <Row label={`Reports (${bounty.reports.length})`}>
        {bounty.reports.length === 0 ? (
          <Txt variant="small" color="textMuted">
            None
          </Txt>
        ) : (
          bounty.reports.map((report, index) => (
            <View key={`${index}-${report.createdAt}`} style={{ gap: 2 }}>
              <Txt variant="small">
                {BOUNTY_REPORT_LABEL[report.reason]} · {report.reporter ? `@${report.reporter.handle}` : 'a former member'} · {formatDateTime(report.createdAt)}
              </Txt>
              {report.note ? (
                <Txt variant="small" color="textMuted">
                  “{report.note}”
                </Txt>
              ) : null}
            </View>
          ))
        )}
      </Row>
      <Row label="Ledger">
        {bounty.ledger.length === 0 ? (
          <Txt variant="small" color="textMuted">
            Nothing yet
          </Txt>
        ) : (
          bounty.ledger.map((entry) => (
            <View key={entry.id} style={{ gap: 2 }}>
              <Txt variant="small">
                {entry.type} · {entry.status} · {formatZar(entry.amountCents)} · {entry.reference} · {formatDateTime(entry.createdAt)}
              </Txt>
              {entry.note ? (
                <Txt variant="small" color="textMuted">
                  {entry.note}
                </Txt>
              ) : null}
            </View>
          ))
        )}
      </Row>
    </>
  )
}

interface Signal {
  red: boolean
  text: string
}

function signals(claim: Claim): Signal[] {
  const preflight = claim.preflight
  if (!preflight) return []
  const list: Signal[] = [
    { red: preflight.claimantCreatedAfterBounty, text: preflight.claimantCreatedAfterBounty ? 'Claimant joined after the bounty was posted' : 'Claimant joined before the bounty was posted' },
    { red: preflight.claimantHasNoOtherActivity, text: preflight.claimantHasNoOtherActivity ? 'No other activity on CIVIC/ONE' : 'Has other activity on CIVIC/ONE' },
    { red: preflight.priorPairings > 0, text: preflight.priorPairings > 0 ? `Paired with this poster before (${preflight.priorPairings})` : 'Never paired with this poster before' },
    { red: preflight.payoutNameMismatch, text: preflight.payoutNameMismatch ? 'Name on the account doesn’t match the profile' : 'Name on the account matches the profile' },
  ]
  if (preflight.payoutAccountAgeHours === null) list.push({ red: true, text: 'No bank account yet' })
  else list.push({ red: preflight.payoutAccountAgeHours < PAYOUT_ACCOUNT_HOLD_HOURS, text: `Bank account added ${preflight.payoutAccountAgeHours} h ago` })
  if (preflight.cooldownEndsAt) {
    const future = inFuture(preflight.cooldownEndsAt)
    list.push({ red: future, text: future ? `Cooling-off ends ${formatDateTime(preflight.cooldownEndsAt)}` : 'Cooling-off over' })
  }
  return list
}

function AdminClaim({ claim, bounty }: { claim: Claim; bounty: Bounty }) {
  const c = useColors()
  const account = claim.payoutAccount
  const risks = signals(claim)
  const decidable = (claim.status === 'CONFIRMED' || claim.status === 'DISPUTED') && DECIDABLE.includes(bounty.status)
  return (
    <View style={[styles.claim, { borderColor: c.line }]}>
      <ClaimantRow claimant={claim.claimant} meta={claim.claimant ? `joined ${formatDate(claim.claimant.createdAt)}` : undefined} />
      <Txt variant="micro" style={{ color: toneColor(claimTone(claim.status), c) }}>
        {claimStatusLabel(claim.status)} · sent {formatRelativeTime(claim.createdAt)}
      </Txt>
      <ClaimText claim={claim} />
      {claim.confirmNote ? (
        <Txt variant="small" color="textMuted">
          Poster’s note to the reviewer: “{claim.confirmNote}”
        </Txt>
      ) : null}
      {claim.posterNote ? (
        <Txt variant="small" color="textMuted">
          Poster’s reason for declining: “{claim.posterNote}”
        </Txt>
      ) : null}
      {claim.disputeNote ? (
        <Txt variant="small" color="textMuted">
          Dispute: “{claim.disputeNote}”
        </Txt>
      ) : null}
      {claim.decisionReason ? (
        <Txt variant="small" color="textMuted">
          Decision: {decisionLabel(claim.decisionReason)}
          {claim.decisionNote ? ` “${claim.decisionNote}”` : ''}
          {claim.decidedAt ? ` (${formatDateTime(claim.decidedAt)})` : ''}
        </Txt>
      ) : null}
      <View style={{ gap: 2 }}>
        <Txt variant="micro" color="textMuted">
          Payout account
        </Txt>
        {account ? (
          <Txt variant="small">
            {account.bankName} •••• {account.accountLast4} · {account.accountName} · ready from {formatDateTime(account.readyAt)}
          </Txt>
        ) : (
          <Txt variant="small" color="textMuted">
            None yet
          </Txt>
        )}
      </View>
      {risks.length ? (
        <View style={{ gap: 4 }} accessibilityRole="list">
          <Txt variant="micro" color="textMuted">
            Before paying
          </Txt>
          {risks.map((signal) => (
            <View key={signal.text} style={styles.signal} accessibilityRole="listitem">
              <Icon name={signal.red ? 'close' : 'check'} size={14} color={signal.red ? c.danger : c.accentText} />
              <Txt variant="small" style={{ flex: 1, color: signal.red ? c.danger : c.text }}>
                {signal.text}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}
      {decidable ? <Decide claim={claim} bounty={bounty} red={risks.some((signal) => signal.red)} /> : null}
    </View>
  )
}

function Decide({ claim, bounty, red }: { claim: Claim; bounty: Bounty; red: boolean }) {
  const c = useColors()
  const toast = useToast()
  const [dialog, setDialog] = useState<'verify' | 'reject' | null>(null)
  const [weighed, setWeighed] = useState(false)
  const [reason, setReason] = useState<ClaimDecisionReason | null>(null)
  const [{ fetching }, decide] = useMutation(DecideClaim)
  const amount = formatZar(bounty.amountCents)
  const handle = claim.claimant ? `@${claim.claimant.handle}` : 'a former member'
  const account = claim.payoutAccount

  const blocker = claim.cooldownUntil && inFuture(claim.cooldownUntil)
    ? `Cooling-off ends ${timeUntil(claim.cooldownUntil)}`
    : !account
      ? 'The claimant hasn’t added a bank account'
      : inFuture(account.readyAt)
        ? `The bank account is ready ${timeUntil(account.readyAt)}`
        : null

  const close = () => {
    setDialog(null)
    setWeighed(false)
    setReason(null)
  }

  const run = async (decision: 'VERIFY' | 'REJECT', chosen: ClaimDecisionReason, note: string, done: string) => {
    const result = await decide({ id: claim.id, decision, reason: chosen, note })
    toast(result.error ? (result.error.graphQLErrors[0]?.message ?? 'That didn’t go through. Reload and try again.') : done)
    close()
  }

  return (
    <>
      <View style={styles.actions}>
        <Button label="Verify and pay" icon="check" disabled={blocker !== null} onPress={() => setDialog('verify')} />
        <Button label="Reject" tone="outline" onPress={() => setDialog('reject')} />
      </View>
      {blocker ? (
        <Txt variant="small" color="textMuted">
          {blocker}
        </Txt>
      ) : null}
      <NoteDialog
        open={dialog === 'verify'}
        title={`Pay ${amount} to ${handle}${account ? ` (${account.bankName} •••• ${account.accountLast4}, “${account.accountName}”)` : ''}?`}
        body="This sends the transfer now."
        label="Note to both parties"
        hint="The claimant and the poster see this with the decision."
        placeholder="What you checked"
        confirmLabel="Pay now"
        confirmTone="accent"
        loading={fetching}
        disabled={red && !weighed}
        onConfirm={(note) => void run('VERIFY', claim.status === 'DISPUTED' ? 'ADMIN_OVERRIDE' : 'VERIFIED', note, `Verified. ${amount} is on its way to ${handle}.`)}
        onClose={close}
      >
        {claim.status === 'DISPUTED' ? (
          <Txt variant="small" color="textMuted">
            The poster declined this claim, so paying it is recorded as an override.
          </Txt>
        ) : null}
        {red ? <Checkbox checked={weighed} onChange={setWeighed} label="I’ve weighed the risk signals above and am releasing anyway" /> : null}
      </NoteDialog>
      <NoteDialog
        open={dialog === 'reject'}
        title="Reject this claim?"
        body="The claimant is told the reason. If this is the confirmed claim, the bounty goes back to taking claims."
        label="Note to the claimant"
        hint="The claimant sees this with the reason; the poster sees the reason only."
        placeholder="What was missing"
        confirmLabel="Reject claim"
        confirmTone="danger"
        loading={fetching}
        disabled={reason === null}
        onConfirm={(note) => {
          if (reason) void run('REJECT', reason, note, 'Claim rejected.')
        }}
        onClose={close}
      >
        <View style={{ gap: 8 }}>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Reason">
            {REJECT_REASONS.map((value) => (
              <Chip key={value} label={REASON_SHORT[value] ?? value} selected={reason === value} onPress={() => setReason(value)} />
            ))}
          </View>
          <Txt variant="small" style={{ color: reason ? c.text : c.textMuted }}>
            {reason ? `Both parties see: ${CLAIM_DECISION_LABEL[reason]}` : 'Choose a reason. Both parties see its wording.'}
          </Txt>
        </View>
      </NoteDialog>
    </>
  )
}

type BountyDialog = 'approve' | 'decline' | 'cancel' | 'freeze' | 'unfreeze' | 'retry' | 'refund' | null

interface NoteAction {
  title: string
  body: string
  label: string
  hint: string
  confirmLabel: string
  tone: 'primary' | 'danger'
  done: string
  action: (note: string) => Promise<Outcome>
}

function BountyActions({ bounty }: { bounty: Bounty }) {
  const c = useColors()
  const toast = useToast()
  const [dialog, setDialog] = useState<BountyDialog>(null)
  const [takeDown, setTakeDown] = useState(false)
  const [approving, approve] = useMutation(ApproveBounty)
  const [declining, decline] = useMutation(DeclineBounty)
  const [cancelling, cancel] = useMutation(AdminCancelBounty)
  const [freezing, freeze] = useMutation(FreezeBounty)
  const [unfreezing, unfreeze] = useMutation(UnfreezeBounty)
  const [retrying, retry] = useMutation(RetryBountyPayout)
  const [refunding, refund] = useMutation(RetryBountyRefund)
  const busy = approving.fetching || declining.fetching || cancelling.fetching || freezing.fetching || unfreezing.fetching || retrying.fetching || refunding.fetching
  const amount = formatZar(bounty.amountCents)
  const id = bounty.id

  const canFreeze = ['OPEN', 'AWAITING_VERIFICATION', 'PENDING_REVIEW'].includes(bounty.status)
  const payoutFailed = bounty.status === 'RELEASING' && bounty.latestPayout?.status === 'FAILED'
  // Out of RELEASING only when the payout failed and has nowhere to go; otherwise the claimant is owed.
  const canCancel = canFreeze || bounty.status === 'FROZEN' || payoutFailed
  const latestRefund = bounty.ledger.filter((entry) => entry.type === 'REFUND').at(-1)
  const canRetryRefund = latestRefund?.status === 'FAILED'
  // A card dispute the bank hasn't closed: a CHARGEBACK row with no CHARGEBACK_REVERSED after it.
  const dispute = bounty.ledger.filter((entry) => entry.type === 'CHARGEBACK').length > bounty.ledger.filter((entry) => entry.type === 'CHARGEBACK_REVERSED').length
  const winner = bounty.claims.find((claim) => claim.id === bounty.winningClaim?.id)
  const account = winner?.payoutAccount
  // The same rule as the first payout: never to an account added minutes ago.
  const retryBlocker = !payoutFailed ? null : !account ? 'The claimant hasn’t added a bank account' : inFuture(account.readyAt) ? `The claimant’s bank account is ready ${timeUntil(account.readyAt)}` : null

  const run = async (action: () => Promise<Outcome>, done: string) => {
    const result = await action()
    toast(result.error ? (result.error.graphQLErrors[0]?.message ?? 'That didn’t go through. Reload and try again.') : done)
    setDialog(null)
  }

  const openCancel = () => {
    // A held or reported bounty is usually being taken down; one cancelled at the poster's request stays readable.
    setTakeDown(bounty.status === 'FROZEN' || bounty.reports.length > 0)
    setDialog('cancel')
  }

  // Every note goes to the person it concerns; there is no private channel, so each label says who reads it.
  const noteDialogs: Record<Exclude<BountyDialog, 'retry' | 'refund' | null>, NoteAction> = {
    approve: { title: 'Approve and list this bounty?', body: 'It goes on the board now.', label: 'Note to the poster', hint: 'The poster sees this with the approval.', confirmLabel: 'Approve and list', tone: 'primary', done: 'Bounty approved and listed.', action: (note) => approve({ id, note }) },
    decline: { title: 'Decline this bounty?', body: `${amount} is refunded to the poster.`, label: 'Note to the poster', hint: 'The poster sees this with the refund.', confirmLabel: 'Decline and refund', tone: 'danger', done: 'Refund started.', action: (note) => decline({ id, note }) },
    cancel: {
      title: 'Cancel and refund this bounty?',
      body: `${amount} goes back to the poster and every live claim is closed.`,
      label: 'Note to the poster',
      hint: 'The poster sees this with the refund; claimants are told the bounty closed.',
      confirmLabel: 'Cancel and refund',
      tone: 'danger',
      done: 'Refund started.',
      action: (note) => cancel({ id, note, takeDown }),
    },
    freeze: { title: 'Put this bounty on hold?', body: 'It leaves the board and nothing moves until the hold is released. Time on hold doesn’t count against it.', label: 'Note to the poster', hint: 'The poster sees this with the hold.', confirmLabel: 'Put on hold', tone: 'danger', done: 'Bounty on hold.', action: (note) => freeze({ id, note }) },
    unfreeze: {
      title: 'Release the hold?',
      body: dispute
        ? 'A card dispute was opened over the payment. Release the hold only once the Paystack dashboard shows it closed in CIVIC/ONE’s favour: the money then counts as held again and the bounty goes back to where it was.'
        : 'The bounty goes back to where it was.',
      label: 'Note to the poster',
      hint: 'The poster sees this when the bounty comes back.',
      confirmLabel: 'Release hold',
      tone: 'primary',
      done: 'Hold released.',
      action: (note) => unfreeze({ id, note }),
    },
  }
  const current = dialog && dialog !== 'retry' && dialog !== 'refund' ? noteDialogs[dialog] : null

  if (!(bounty.status === 'PENDING_REVIEW' || canFreeze || canCancel || payoutFailed || canRetryRefund)) return null

  return (
    <View style={styles.bountyActions}>
      {dispute ? (
        <Txt variant="small" style={[styles.notice, { color: c.danger }]}>
          A card dispute is open over the payment. Nothing moves until the bank decides; a dispute lost closes the bounty by itself.
        </Txt>
      ) : null}
      {bounty.status === 'PENDING_REVIEW' ? (
        <>
          <Button label="Approve and list" icon="check" onPress={() => setDialog('approve')} />
          <Button label="Decline and refund" tone="danger" onPress={() => setDialog('decline')} />
        </>
      ) : null}
      {payoutFailed ? <Button label="Retry payout" tone="outline" disabled={retryBlocker !== null} onPress={() => setDialog('retry')} /> : null}
      {canRetryRefund ? <Button label="Retry refund" tone="outline" onPress={() => setDialog('refund')} /> : null}
      {canFreeze ? <Button label="Put on hold" tone="outline" icon="lock" onPress={() => setDialog('freeze')} /> : null}
      {bounty.status === 'FROZEN' ? <Button label="Release hold" tone="outline" onPress={() => setDialog('unfreeze')} /> : null}
      {canCancel ? <Button label="Cancel and refund" tone="danger" onPress={openCancel} /> : null}
      {retryBlocker ? (
        <Txt variant="small" color="textMuted" style={styles.notice}>
          {retryBlocker}
        </Txt>
      ) : null}
      <NoteDialog
        open={current !== null}
        title={current?.title ?? ''}
        body={current?.body}
        label={current?.label ?? 'Note'}
        hint={current?.hint}
        placeholder="Why"
        confirmLabel={current?.confirmLabel ?? 'Confirm'}
        confirmTone={current?.tone}
        loading={busy}
        onConfirm={(note) => {
          if (current) void run(() => current.action(note), current.done)
        }}
        onClose={() => setDialog(null)}
      >
        {dialog === 'cancel' ? <Checkbox checked={takeDown} onChange={setTakeDown} label="Take the page down too: afterwards only the poster, its claimants and CIVIC/ONE can open it" /> : null}
      </NoteDialog>
      <ConfirmDialog
        open={dialog === 'retry'}
        title="Retry the payout?"
        body={`Sends ${amount} to the claimant’s current bank account${account ? ` (${account.bankName} •••• ${account.accountLast4}, “${account.accountName}”)` : ''} now, under the same checks as the first time.`}
        confirmLabel="Retry payout"
        loading={busy}
        onConfirm={() => void run(() => retry({ id }), 'Payout retried.')}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'refund'}
        title="Send the refund again?"
        body={`Asks the provider again to return ${latestRefund ? formatZar(latestRefund.amountCents) : amount} to the card that paid.`}
        confirmLabel="Retry refund"
        loading={busy}
        onConfirm={() => void run(() => refund({ id }), 'Refund sent again.')}
        onClose={() => setDialog(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  link: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
  claim: { marginHorizontal: 18, marginVertical: 8, padding: 14, gap: 10, borderWidth: 1, borderRadius: radius.lg },
  signal: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  bountyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12 },
  notice: { width: '100%' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
