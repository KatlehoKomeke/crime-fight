import { BOUNTY_KIND_RULES, CLAIM_POSTER_RESPONSE_DAYS, formatRelativeTime, formatZar } from '@civic/core'
import type { BountyDetailFieldsFragment } from '@civic/graphql'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { type CombinedError, useMutation } from 'urql'
import { ConfirmClaim, ObjectToClaim } from '@/graphql/documents'
import { claimStatusLabel, claimTone, decisionLabel, formatDate, formatDateTime, toneColor } from '@/lib/bounty-copy'
import { radius, useColors } from '@/theme'
import { useToast } from '../Toast'
import { Button, Section, Txt } from '../ui'
import { ClaimantRow, ClaimText, NoteDialog } from './ClaimCard'

type Bounty = BountyDetailFieldsFragment
type Claim = Bounty['claims'][number]

/**
 * The poster's side of the bounty. A claim reaches CIVIC/ONE first: the poster
 * sees how many are being checked, and each claim itself once it's approved,
 * with the answer it's waiting for.
 */
export function ManageCard({ bounty }: { bounty: Bounty }) {
  const checking = bounty.claimsBeingChecked
  return (
    <Section title={`Claims (${bounty.claims.length})`}>
      {checking > 0 ? (
        <Txt variant="small" color="textMuted" style={styles.empty}>
          {checking === 1 ? 'One claim is' : `${checking} claims are`} being checked by CIVIC/ONE. You’ll see a claim, and who sent it, once we approve it.
        </Txt>
      ) : null}
      {bounty.claims.length === 0 && checking === 0 ? (
        <Txt variant="small" color="textMuted" style={styles.empty}>
          No claims yet. We’ll notify you when one comes in.
        </Txt>
      ) : (
        bounty.claims.map((claim) => <PosterClaim key={claim.id} claim={claim} bounty={bounty} />)
      )}
    </Section>
  )
}

function PosterClaim({ claim, bounty }: { claim: Claim; bounty: Bounty }) {
  const c = useColors()
  // The API only takes the poster's answer on the claim the bounty is waiting on.
  const answerable = claim.status === 'APPROVED' && bounty.status === 'AWAITING_VERIFICATION'
  return (
    <View style={[styles.claim, { borderColor: c.line }]}>
      <ClaimantRow claimant={claim.claimant} meta={`Sent ${formatRelativeTime(claim.createdAt)}`} />
      <Txt variant="micro" style={{ color: toneColor(claimTone(claim.status), c) }}>
        {claimStatusLabel(claim.status)}
      </Txt>
      <ClaimText claim={claim} />
      <Standing claim={claim} bounty={bounty} />
      {answerable ? <Answer claim={claim} bounty={bounty} /> : null}
    </View>
  )
}

function Standing({ claim, bounty }: { claim: Claim; bounty: Bounty }) {
  const amount = formatZar(bounty.amountCents)
  const waiting = claim.cooldownUntil ? ` ending ${formatDateTime(claim.cooldownUntil)}` : ''
  switch (claim.status) {
    case 'APPROVED':
      return (
        <Txt variant="small" color="textMuted">
          CIVIC/ONE checked this claim. Did it happen? Confirm it, or tell us why you object{claim.posterAnswerDue ? `, by ${formatDate(claim.posterAnswerDue)}` : ''}. If you don’t answer, that counts as no
          objection, and CIVIC/ONE pays {amount} after a waiting period{waiting}.
        </Txt>
      )
    case 'CONFIRMED':
      return (
        <Txt variant="small" color="textMuted">
          Confirmed, by you or by not objecting in time. CIVIC/ONE pays after a waiting period{waiting}.
          {claim.confirmNote ? ` Your note to the reviewer: “${claim.confirmNote}”` : ''}
        </Txt>
      )
    case 'DISPUTED':
      return (
        <Txt variant="small" color="textMuted">
          You objected{claim.posterNote ? `: “${claim.posterNote}”` : ''}. A CIVIC/ONE reviewer decides, and may still pay the claim.
        </Txt>
      )
    case 'VERIFIED':
      return (
        <Txt variant="small" color="textMuted">
          Verified by CIVIC/ONE. {amount} is on its way to the claimant.
        </Txt>
      )
    case 'PAID':
      return (
        <Txt variant="small" color="textMuted">
          Paid. This bounty is honoured.
        </Txt>
      )
    case 'REJECTED':
      return (
        <Txt variant="small" color="textMuted">
          Rejected by CIVIC/ONE.{claim.decisionReason ? ` ${decisionLabel(claim.decisionReason)}` : ''}
        </Txt>
      )
    default:
      return null
  }
}

function Answer({ claim, bounty }: { claim: Claim; bounty: Bounty }) {
  const toast = useToast()
  const [dialog, setDialog] = useState<'confirm' | 'object' | null>(null)
  const [confirming, confirm] = useMutation(ConfirmClaim)
  const [objecting, object] = useMutation(ObjectToClaim)
  const amount = formatZar(bounty.amountCents)
  const who = claim.claimant ? `@${claim.claimant.handle}` : 'this person'
  const cooldownDays = BOUNTY_KIND_RULES[bounty.kind].cooldownHours / 24

  const run = async (action: () => Promise<{ error?: CombinedError }>, done: string, fallback: string) => {
    const result = await action()
    toast(result.error ? (result.error.graphQLErrors[0]?.message ?? fallback) : done)
    setDialog(null)
  }

  return (
    <>
      <View style={styles.actions}>
        <Button label="Confirm" icon="check" onPress={() => setDialog('confirm')} />
        <Button label="Object" tone="outline" onPress={() => setDialog('object')} />
      </View>
      <NoteDialog
        open={dialog === 'confirm'}
        title="Confirm this claim?"
        body={`You’re telling CIVIC/ONE that ${who} honoured this bounty. ${amount} is paid to them once the ${cooldownDays}-day waiting period ends. You can’t undo this.`}
        label="Note for CIVIC/ONE (optional)"
        hint="Only the reviewer sees this; the claimant doesn’t."
        placeholder="Anything our reviewer should know"
        required={false}
        confirmLabel="Yes, confirm"
        loading={confirming.fetching}
        onConfirm={(note) => void run(() => confirm({ id: claim.id, note: note || undefined }), 'Claim confirmed.', 'Couldn’t confirm the claim. Try again.')}
        onClose={() => setDialog(null)}
      />
      <NoteDialog
        open={dialog === 'object'}
        title="Object to this claim?"
        body={`A CIVIC/ONE reviewer looks at your reason and decides. They have the final say, and can pay the claim anyway if it honours the bounty. You have ${CLAIM_POSTER_RESPONSE_DAYS} days from approval to object.`}
        label="Why doesn’t this honour the bounty?"
        hint="Only the reviewer sees this; the claimant is told you objected, not why."
        placeholder="What didn’t happen, or what doesn’t match"
        confirmLabel="Object"
        confirmTone="danger"
        loading={objecting.fetching}
        onConfirm={(note) => void run(() => object({ id: claim.id, note }), 'Sent to CIVIC/ONE to decide.', 'Couldn’t send your objection. Try again.')}
        onClose={() => setDialog(null)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: 18, paddingVertical: 12 },
  claim: { marginHorizontal: 18, marginVertical: 8, padding: 14, gap: 10, borderWidth: 1, borderRadius: radius.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
})
