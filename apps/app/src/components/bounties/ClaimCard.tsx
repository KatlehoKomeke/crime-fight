import { BOUNTY_NOTE_MAX, CLAIM_DISPUTE_DAYS, CLAIM_POSTER_RESPONSE_DAYS, formatRelativeTime, formatZar, PAYOUT_ACCOUNT_HOLD_HOURS } from '@civic/core'
import type { BountyDetailFieldsFragment, ClaimFieldsFragment } from '@civic/graphql'
import { Link, useRouter } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useMutation } from 'urql'
import { DisputeClaim, WithdrawClaim } from '@/graphql/documents'
import { claimStatusLabel, claimTone, decisionLabel, formatDate, formatDateTime, toneColor } from '@/lib/bounty-copy'
import { profilePath } from '@/lib/profile'
import { radius, useColors } from '@/theme'
import { ConfirmDialog } from '../ConfirmDialog'
import { Icon } from '../Icon'
import { useToast } from '../Toast'
import { Avatar, Button, Field, Input, Txt, VerifiedBadge } from '../ui'

/*
 * The claimant's view of their claim, and the pieces every rendering of a
 * claim shares: who sent it, its text and links, and the dialog that takes a
 * note before something irreversible happens. The poster's and the admin's
 * cards build on the same pieces.
 */

const DAY_MS = 24 * 60 * 60_000

export const addDays = (value: string, days: number) => new Date(new Date(value).getTime() + days * DAY_MS)

/** Whether a deadline is still ahead. Only rendered for a signed-in viewer, so the server never has to agree. */
export const inFuture = (value: string | Date) => new Date(value).getTime() > Date.now()

/**
 * A confirmation that needs (or offers) a note: a reason for declining, a
 * dispute, an admin's record. The note is cleared every time it opens.
 */
export function NoteDialog({
  open,
  title,
  body,
  label,
  hint,
  placeholder,
  confirmLabel,
  confirmTone,
  cancelLabel,
  required = true,
  loading,
  disabled,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  body?: string
  label: string
  hint?: string
  placeholder?: string
  confirmLabel: string
  confirmTone?: 'primary' | 'danger' | 'accent'
  cancelLabel?: string
  required?: boolean
  loading?: boolean
  disabled?: boolean
  onConfirm: (note: string) => void
  onClose: () => void
  children?: ReactNode
}) {
  const [note, setNote] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setNote('')
  }
  const trimmed = note.trim()
  const over = note.length > BOUNTY_NOTE_MAX
  const ready = (!required || trimmed.length > 0) && !over
  return (
    <ConfirmDialog
      open={open}
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      confirmTone={confirmTone}
      cancelLabel={cancelLabel}
      loading={loading}
      disabled={disabled || !ready}
      onConfirm={() => onConfirm(trimmed)}
      onClose={onClose}
    >
      {children}
      <Field label={label} count={`${note.length}/${BOUNTY_NOTE_MAX}`} over={over} hint={hint}>
        <Input value={note} onChangeText={setNote} multiline maxLength={BOUNTY_NOTE_MAX + 50} placeholder={placeholder} accessibilityLabel={label} invalid={over} />
      </Field>
    </ConfirmDialog>
  )
}

/** Who sent a claim, linking to their profile; `meta` sits after the handle ("Sent 3h", "joined 4 May 2026"). */
export function ClaimantRow({ claimant, meta }: { claimant: ClaimFieldsFragment['claimant']; meta?: string }) {
  if (!claimant) {
    return (
      <View style={styles.identity}>
        <Avatar initials="··" size={36} />
        <View style={styles.names}>
          <Txt variant="smallStrong">A former member</Txt>
          {meta ? (
            <Txt variant="small" color="textMuted">
              {meta}
            </Txt>
          ) : null}
        </View>
      </View>
    )
  }
  return (
    <Link href={profilePath(claimant.handle)} asChild>
      <Pressable style={styles.identity} accessibilityLabel={`${claimant.displayName} profile`}>
        <Avatar initials={claimant.initials} url={claimant.avatarUrl} size={36} official={claimant.verified && claimant.role !== 'MEMBER'} />
        <View style={styles.names}>
          <View style={styles.nameLine}>
            <Txt variant="smallStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
              {claimant.displayName}
            </Txt>
            {claimant.verified ? <VerifiedBadge size={13} /> : null}
          </View>
          <Txt variant="small" color="textMuted" numberOfLines={1}>
            @{claimant.handle}
            {meta ? ` · ${meta}` : ''}
          </Txt>
        </View>
      </Pressable>
    </Link>
  )
}

/**
 * A claim's text and its links, all as plain text: a claim reaches someone who
 * is known to hold money, so nothing in it is a tap away from a stranger's page.
 */
export function ClaimText({ claim, collapsible }: { claim: Pick<ClaimFieldsFragment, 'body' | 'links'>; collapsible?: boolean }) {
  const c = useColors()
  const [expanded, setExpanded] = useState(false)
  const long = Boolean(collapsible) && (claim.body.length > 280 || claim.body.split('\n').length > 4)
  if (!claim.body) {
    return (
      <Txt variant="small" color="textMuted">
        The text of this claim was removed, as the privacy policy says it is a year after the bounty closes.
      </Txt>
    )
  }
  return (
    <View style={{ gap: 6 }}>
      <Txt numberOfLines={long && !expanded ? 4 : undefined} selectable>
        {claim.body}
      </Txt>
      {long ? (
        <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded }} style={{ alignSelf: 'flex-start' }}>
          <Txt variant="smallStrong" style={{ color: c.accentText }}>
            {expanded ? 'Show less' : 'Show more'}
          </Txt>
        </Pressable>
      ) : null}
      {claim.links.map((link, index) => (
        <Txt key={`${index}-${link}`} variant="small" color="textMuted" selectable>
          {link}
        </Txt>
      ))}
    </View>
  )
}

/** The claimant's own claim on the bounty page: where it stands and what they can still do. */
export function ClaimCard({ claim, bounty }: { claim: ClaimFieldsFragment; bounty: BountyDetailFieldsFragment }) {
  const c = useColors()
  return (
    <View style={[styles.card, { borderColor: c.line }]} accessibilityLabel="Your claim">
      <View style={styles.head}>
        <Txt variant="micro" color="textMuted" accessibilityRole="header">
          Your claim
        </Txt>
        <Txt variant="micro" style={{ color: toneColor(claimTone(claim.status), c) }}>
          {claimStatusLabel(claim.status)}
        </Txt>
      </View>
      <Txt variant="small" color="textMuted">
        Sent {formatRelativeTime(claim.createdAt)}
      </Txt>
      <ClaimText claim={claim} collapsible />
      <Outcome claim={claim} bounty={bounty} />
    </View>
  )
}

function Outcome({ claim, bounty }: { claim: ClaimFieldsFragment; bounty: BountyDetailFieldsFragment }) {
  const c = useColors()
  const router = useRouter()
  const amount = formatZar(bounty.amountCents)
  switch (claim.status) {
    case 'SUBMITTED':
      return (
        <>
          <Txt variant="small" color="textMuted">
            The poster has been notified and has {CLAIM_POSTER_RESPONSE_DAYS} days to answer. If they confirm, CIVIC/ONE verifies and pays you.
          </Txt>
          <WithdrawAction claimId={claim.id} />
        </>
      )
    case 'REJECTED_BY_POSTER': {
      const until = claim.rejectedAt ? addDays(claim.rejectedAt, CLAIM_DISPUTE_DAYS) : null
      const canDispute = !until || inFuture(until)
      return (
        <>
          <Txt variant="small" color="textMuted">
            The poster declined this claim{claim.posterNote ? `: “${claim.posterNote}”` : ''}.
            {canDispute ? ` If you think that’s wrong, you can ask a CIVIC/ONE reviewer to look at it${until ? ` until ${formatDate(until)}` : ''}.` : ''}
          </Txt>
          {canDispute ? (
            <DisputeAction claimId={claim.id} />
          ) : (
            <Txt variant="small" color="textMuted">
              The time to dispute this decision has passed.
            </Txt>
          )}
        </>
      )
    }
    case 'DISPUTED':
      return (
        <>
          <Txt variant="small" color="textMuted">
            A CIVIC/ONE reviewer will decide. You may be asked for more detail.
          </Txt>
          {claim.disputeNote ? (
            <Txt variant="small" color="textMuted">
              “{claim.disputeNote}”
            </Txt>
          ) : null}
        </>
      )
    case 'CONFIRMED':
      return (
        <>
          <Txt variant="small" color="textMuted">
            Confirmed by the poster. CIVIC/ONE verifies after a waiting period{claim.cooldownUntil ? ` ending ${formatDateTime(claim.cooldownUntil)}` : ''}.
          </Txt>
          <View style={[styles.notice, { backgroundColor: c.warningTint }]}>
            <Icon name="bounty" size={15} color={c.warning} />
            <View style={{ flex: 1, gap: 10 }}>
              <Txt variant="small">
                <Txt variant="smallStrong">Make sure the bank account in Settings is yours and ready. </Txt>
                That’s where {amount} goes. Payouts start {PAYOUT_ACCOUNT_HOLD_HOURS} hours after you add an account, so add one now if you haven’t.
              </Txt>
              <Button label="Open Settings" tone="outline" size="sm" icon="settings" onPress={() => router.push('/settings')} />
            </View>
          </View>
        </>
      )
    case 'VERIFIED':
      return (
        <Txt variant="small" color="textMuted">
          Verified. {amount} is on its way to your bank account.
        </Txt>
      )
    case 'PAID': {
      const paidAt = bounty.closedAt ?? claim.decidedAt
      return (
        <Txt variant="small" color="textMuted">
          {paidAt ? `Paid on ${formatDate(paidAt)}.` : 'Paid.'}
        </Txt>
      )
    }
    case 'REJECTED':
      return (
        <Txt variant="small" color="textMuted">
          This claim wasn’t accepted.{claim.decisionReason ? ` ${decisionLabel(claim.decisionReason)}` : ''}
          {claim.decisionNote ? ` ${claim.decisionNote}` : ''}
        </Txt>
      )
    case 'WITHDRAWN':
      return (
        <Txt variant="small" color="textMuted">
          You withdrew this claim.
        </Txt>
      )
  }
}

function WithdrawAction({ claimId }: { claimId: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [{ fetching }, withdraw] = useMutation(WithdrawClaim)

  const run = async () => {
    const result = await withdraw({ id: claimId })
    if (result.error) toast(result.error.graphQLErrors[0]?.message ?? 'Couldn’t withdraw the claim. Try again.')
    else toast('Claim withdrawn.')
    setOpen(false)
  }

  return (
    <>
      <View style={styles.actions}>
        <Button label="Withdraw claim" tone="ghost" size="sm" onPress={() => setOpen(true)} />
      </View>
      <ConfirmDialog
        open={open}
        title="Withdraw your claim?"
        body="The poster won’t see it any more. A bounty can be claimed once, so you can’t send another claim on this one."
        confirmLabel="Withdraw"
        confirmTone="danger"
        loading={fetching}
        onConfirm={() => void run()}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function DisputeAction({ claimId }: { claimId: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [{ fetching }, dispute] = useMutation(DisputeClaim)

  const run = async (note: string) => {
    const result = await dispute({ id: claimId, note })
    if (result.error) toast(result.error.graphQLErrors[0]?.message ?? 'Couldn’t send that. Try again.')
    else toast('Sent. A CIVIC/ONE reviewer will decide.')
    setOpen(false)
  }

  return (
    <>
      <View style={styles.actions}>
        <Button label="Ask for a review" tone="outline" size="sm" onPress={() => setOpen(true)} />
      </View>
      <NoteDialog
        open={open}
        title="Ask CIVIC/ONE to review this?"
        body="Say why your claim honours the bounty. A reviewer decides, and can pay the reward even though the poster declined."
        label="Why the claim should stand"
        placeholder="What you did, and what the poster may have missed"
        confirmLabel="Ask for a review"
        loading={fetching}
        onConfirm={(note) => void run(note)}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 18, marginVertical: 14, padding: 16, gap: 10, borderWidth: 1, borderRadius: radius.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  names: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: radius.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
})
