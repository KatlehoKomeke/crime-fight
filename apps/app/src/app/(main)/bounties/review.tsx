import { formatRelativeTime } from '@civic/core'
import type { BountyQueueQuery as BountyQueue } from '@civic/graphql'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { useMutation, useQuery } from 'urql'
import { BountyRow } from '@/components/bounties/BountyRow'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FeedList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, PostSkeleton, Txt } from '@/components/ui'
import { AdminStateQuery, BountyQueueQuery, SweepBounties } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { formatDateTime } from '@/lib/bounty-copy'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { pageMetadata } from '@/lib/seo'
import { PAGE_SIZE } from '@/lib/variables'
import { useColors } from '@/theme'

export function generateMetadata() {
  return pageMetadata({ title: 'Review', path: '/bounties/review', noindex: true })
}

type QueueBounty = BountyQueue['bountyQueue']['edges'][number]['node']

/** Why a bounty is in the queue, from what the row carries. Several reasons read as one line. */
function queueReasons(bounty: QueueBounty): string[] {
  const reasons: string[] = []
  if (bounty.status === 'PENDING_REVIEW') reasons.push('Awaiting approval')
  if (bounty.status === 'FROZEN') reasons.push('On hold')
  for (const claim of bounty.claims) {
    const who = claim.claimant ? `@${claim.claimant.handle}` : 'a former member'
    const cooldown = claim.cooldownUntil ? ` · cooling-off ends ${formatDateTime(claim.cooldownUntil)}` : ''
    if (claim.status === 'SUBMITTED') {
      reasons.push(`New claim from ${who} · check it`)
    } else if (claim.status === 'APPROVED') {
      reasons.push(`Approved · the poster answers by ${claim.posterAnswerDue ? formatDateTime(claim.posterAnswerDue) : 'the deadline'}${cooldown} · ${who}`)
    } else if (claim.status === 'CONFIRMED') {
      reasons.push(`Confirmed ${formatRelativeTime(claim.confirmedAt ?? claim.createdAt)}${cooldown} · pay ${who}`)
    } else if (claim.status === 'DISPUTED') {
      reasons.push(`The poster objected to ${who}’s claim · decide`)
    } else if (claim.status === 'VERIFIED') {
      reasons.push(`Verified · paying ${who}`)
    }
  }
  if (bounty.latestPayout?.status === 'FAILED') reasons.push('Payout failed — retry from the bounty')
  if (bounty.reports.length > 0) reasons.push(`${bounty.reports.length} ${bounty.reports.length === 1 ? 'report' : 'reports'}`)
  // The queue also holds cancellation requests, failed refunds and payment mismatches, which the row doesn't carry.
  if (reasons.length === 0) reasons.push('Cancellation request, failed refund or payment mismatch — open the bounty')
  return reasons
}

/** `/bounties/review`: everything waiting on an administrator. Reviewers only; everyone else sees a lock. */
export default function ReviewScreen() {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const { status } = useAuth()
  const [{ data, error }, reexecute] = useQuery({ query: AdminStateQuery, pause: status !== 'signed-in' })
  // Three answers: not yet known (the session or the query is still loading), no, and yes. Only "no" shows the lock.
  const known = status === 'signed-out' || (status === 'signed-in' && data !== undefined)
  const admin = status === 'signed-in' && Boolean(data?.viewer?.viewerIsAdmin)
  const queue = usePaginatedQuery(BountyQueueQuery, { first: PAGE_SIZE }, (result) => result?.bountyQueue, { pause: !admin })
  const [{ fetching: sweeping }, sweep] = useMutation(SweepBounties)
  const [confirmSweep, setConfirmSweep] = useState(false)

  const runSweep = async () => {
    const result = await sweep({})
    const report = result.data?.sweepBounties
    setConfirmSweep(false)
    if (report) {
      toast(`Sweep done: ${report.expired} expired, ${report.abandoned} abandoned, ${report.escalated} escalated, ${report.expiring} expiring, ${report.redriven} re-driven, ${report.scrubbed} texts removed`)
    }
    else toast(result.error?.graphQLErrors[0]?.message ?? 'The sweep didn’t run')
  }

  let body
  if (status === 'signed-in' && !data && error) {
    body = (
      <EmptyState
        icon="globe"
        title="Can’t reach CIVIC/ONE"
        body="Check your connection and try again."
        action={<Button label="Retry" tone="outline" onPress={() => reexecute({ requestPolicy: 'network-only' })} />}
      />
    )
  } else if (!known) {
    body = (
      <View accessibilityElementsHidden>
        {[0, 1, 2].map((i) => (
          <PostSkeleton key={i} />
        ))}
      </View>
    )
  } else if (!admin) {
    body = (
      <EmptyState
        icon="lock"
        title="Reviewers only"
        body="This page is for the CIVIC/ONE members who verify bounties."
        action={status === 'signed-out' ? <Button label="Sign in" onPress={() => router.push('/sign-in')} /> : undefined}
      />
    )
  } else {
    body = (
      <FeedList
        {...queue}
        renderItem={(bounty) => (
          <BountyRow bounty={bounty}>
            <Txt variant="smallStrong" style={{ color: c.warning, marginTop: 3 }}>
              {queueReasons(bounty).join(' · ')}
            </Txt>
          </BountyRow>
        )}
        onEndReached={queue.loadMore}
        onRefresh={queue.refresh}
        empty={<EmptyState icon="shield" title="Nothing to review" body="New claims, confirmed claims, objections, missing-person bounties, failed payouts and reports land here." />}
      />
    )
  }

  return (
    <Screen
      title="Review"
      header={
        <PageHeader
          title="Review"
          subtitle="Dual control: you check each claim, the poster confirms, you pay."
          right={admin ? <Button size="sm" tone="outline" label="Run sweep" loading={sweeping} onPress={() => setConfirmSweep(true)} /> : undefined}
        />
      }
    >
      {body}
      <ConfirmDialog
        open={confirmSweep}
        title="Run the sweep now?"
        body="It closes and refunds bounties that ran out of time, abandons checkouts nobody completed, hands unanswered claims to CIVIC/ONE and asks the provider again about pending money. It runs every hour on its own."
        confirmLabel="Run sweep"
        loading={sweeping}
        onConfirm={() => void runSweep()}
        onClose={() => setConfirmSweep(false)}
      />
    </Screen>
  )
}
