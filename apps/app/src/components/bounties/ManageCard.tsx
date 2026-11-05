import { BOUNTY_KIND_RULES, CLAIM_DISPUTE_DAYS, CLAIM_POSTER_RESPONSE_DAYS, formatRelativeTime, formatZar } from '@civic/core'
import type { BountyDetailFieldsFragment } from '@civic/graphql'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { type CombinedError, useMutation } from 'urql'
import { ConfirmClaim, RejectClaim } from '@/graphql/documents'
import { claimStatusLabel, claimTone, decisionLabel, formatDate, formatDateTime, toneColor } from '@/lib/bounty-copy'
import { radius, useColors } from '@/theme'
import { useToast } from '../Toast'
import { Button, Section, Txt } from '../ui'
import { addDays, ClaimantRow, ClaimText, NoteDialog } from './ClaimCard'

type Bounty = BountyDetailFieldsFragment
type Claim = Bounty['claims'][number]

/** The poster's side of the bounty: every claim, and the answer each one is waiting for. */
export function ManageCard({ bounty }: { bounty: Bounty }) {
  return (
    <Section title={`Claims (${bounty.claims.length})`}>
      {bounty.claims.length === 0 ? (
        <Txt variant="small" color="textMuted" style={styles.empty}>
          No claims yet. We’ll notify you when someone sends one.
        </Txt>
      ) : (
        bounty.claims.map((claim) => <PosterClaim key={claim.id} claim={claim} bounty={bounty} />)
      )}
    </Section>
  )
}

function PosterClaim({ claim, bounty }: { claim: Claim; bounty: Bounty }) {
  const c = useColors()
  // The API only takes a poster's answer while the bounty is open; elsewhere the claim just shows where it stands.
  const answerable = bounty.status === 'OPEN' && (claim.status === 'SUBMITTED' || claim.status === 'DISPUTED')
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
  switch (claim.status) {
    case 'SUBMITTED':
      return (
        <Txt variant="small" color="textMuted">
          Answer by {formatDate(addDays(claim.createdAt, CLAIM_POSTER_RESPONSE_DAYS))}. If you don’t, CIVIC/ONE decides.
        </Txt>
      )
    case 'REJECTED_BY_POSTER':
      return (
        <Txt variant="small" color="textMuted">
          You declined this claim{claim.posterNote ? `: “${claim.posterNote}”` : ''}.
        </Txt>
      )
    case 'DISPUTED':
      return (
        <Txt variant="small" color="textMuted">
          With CIVIC/ONE to decide{claim.disputeNote ? `: “${claim.disputeNote}”` : ''}. You can still confirm it if you now agree.
        </Txt>
      )
    case 'CONFIRMED':
      return (
        <Txt variant="small" color="textMuted">
          You confirmed this claim. CIVIC/ONE verifies after a waiting period{claim.cooldownUntil ? ` ending ${formatDateTime(claim.cooldownUntil)}` : ''}.
          {claim.confirmNote ? ` Your note to the reviewer: “${claim.confirmNote}”` : ''}
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
    case 'WITHDRAWN':
      return (
        <Txt variant="small" color="textMuted">
          Withdrawn by the claimant.
        </Txt>
      )
  }
}

function Answer({ claim, bounty }: { claim: Claim; bounty: Bounty }) {
  const toast = useToast()
  const [dialog, setDialog] = useState<'confirm' | 'decline' | null>(null)
  const [confirming, confirm] = useMutation(ConfirmClaim)
  const [declining, decline] = useMutation(RejectClaim)
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
        {claim.status === 'SUBMITTED' ? <Button label="Decline" tone="outline" onPress={() => setDialog('decline')} /> : null}
      </View>
      <NoteDialog
        open={dialog === 'confirm'}
        title="Confirm this claim?"
        body={`You’re telling CIVIC/ONE that ${who} honoured this bounty. We’ll verify it after a waiting period of ${cooldownDays} days and pay ${amount} to them. You can’t undo this.`}
        label="Note for CIVIC/ONE (optional)"
        hint="Only the reviewer sees this; the claimant doesn’t."
        placeholder="Anything our reviewer should know"
        required={false}
        confirmLabel="Yes, confirm"
        loading={confirming.fetching}
        onConfirm={(note) => void run(() => confirm({ id: claim.id, note: note || undefined }), 'Claim confirmed. We’re verifying it now.', 'Couldn’t confirm the claim. Try again.')}
        onClose={() => setDialog(null)}
      />
      <NoteDialog
        open={dialog === 'decline'}
        title="Decline this claim?"
        label="Why doesn’t this honour the bounty?"
        hint={`They can ask CIVIC/ONE to review your decision within ${CLAIM_DISPUTE_DAYS} days.`}
        placeholder="What’s missing, or what doesn’t match"
        confirmLabel="Decline claim"
        confirmTone="danger"
        loading={declining.fetching}
        onConfirm={(note) => void run(() => decline({ id: claim.id, note }), 'Claim declined', 'Couldn’t decline the claim. Try again.')}
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
