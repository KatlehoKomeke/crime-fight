import { formatZar } from '@civic/core'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useMutation, useQuery } from 'urql'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Button, Card, EmptyState, Txt } from '@/components/ui'
import { BountyQuery, ConfirmBountyPayment, RetryBountyCheckout, SandboxCompleteCheckout } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { openCheckout } from '@/lib/checkout'
import { usePaymentsStatus } from '@/lib/payments'
import { pageMetadata } from '@/lib/seo'
import { bountyVariables, param } from '@/lib/variables'
import { useColors } from '@/theme'

export function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  return pageMetadata({ title: 'Confirming your payment', path: `/bounties/${param(params.id)}/paid`, noindex: true })
}

const POLL_EVERY_MS = 3_000
const POLL_FOR_MS = 60_000

type Outcome = 'SUCCESS' | 'FAILED' | 'WRONG_AMOUNT'
type Phase = 'sandbox' | 'confirming' | 'stalled'

/**
 * Where the payment provider sends the poster back. Paystack appends
 * `?reference=` (and `trxref=`); the sandbox sends them here with `sandbox=1`
 * and lets them choose how the pretend payment went.
 */
export default function PaidScreen() {
  const router = useRouter()
  const { status } = useAuth()
  const params = useLocalSearchParams<{ id: string; reference?: string; trxref?: string; sandbox?: string }>()
  const id = param(params.id)
  const reference = param(params.reference) || param(params.trxref)

  return (
    <Screen title="Confirming your payment" header={<PageHeader title="Confirming your payment" />}>
      {status === 'loading' ? (
        <Waiting />
      ) : status === 'signed-out' ? (
        <EmptyState
          icon="lock"
          title="Sign in to finish paying for your bounty"
          body="Sign in with the account you posted it from and we’ll check on the payment."
          action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      ) : (
        // A new checkout brings a new reference; keying on it starts the flow over.
        <PaymentFlow key={reference} id={id} reference={reference} sandboxParam={param(params.sandbox) === '1'} />
      )}
    </Screen>
  )
}

function PaymentFlow({ id, reference, sandboxParam }: { id: string; reference: string; sandboxParam: boolean }) {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const payments = usePaymentsStatus()
  const [phase, setPhase] = useState<Phase>(() => (sandboxParam || payments.sandbox ? 'sandbox' : 'confirming'))
  const [notice, setNotice] = useState<string | null>(null)
  const [{ data, error }, reexecute] = useQuery({ query: BountyQuery, variables: bountyVariables(id), requestPolicy: 'network-only' })
  const [, confirmPayment] = useMutation(ConfirmBountyPayment)
  const [{ fetching: pretending, operation: pretendOperation }, pretend] = useMutation(SandboxCompleteCheckout)
  const [{ fetching: retrying }, retryCheckout] = useMutation(RetryBountyCheckout)
  const bounty = data?.bounty
  const notFound = data !== undefined && !bounty
  const bountyStatus = bounty?.status
  const navigated = useRef(false)

  // The outcome: as soon as the bounty is no longer waiting for money, go to it.
  useEffect(() => {
    if (!bountyStatus || bountyStatus === 'PENDING_PAYMENT' || navigated.current) return
    navigated.current = true
    if (bountyStatus === 'OPEN') {
      toast('Your bounty is live')
      router.replace({ pathname: '/bounties/[id]', params: { id, live: '1' } })
    } else if (bountyStatus === 'PENDING_REVIEW') {
      router.replace({ pathname: '/bounties/[id]', params: { id, review: '1' } })
    } else {
      router.replace(`/bounties/${id}`)
    }
  }, [bountyStatus, id, router, toast])

  // Ask the provider once, then watch for the webhook to settle it.
  useEffect(() => {
    if (phase !== 'confirming' || notFound) return
    let cancelled = false
    void confirmPayment({ id }).then((result) => {
      if (cancelled) return
      // A refusal (payments off, not your bounty) won't change with time; a network blip might, so polling carries on through those.
      const refused = result.error?.graphQLErrors[0]
      if (refused) {
        setNotice(refused.message)
        setPhase('stalled')
        return
      }
      reexecute({ requestPolicy: 'network-only' })
    })
    const interval = setInterval(() => reexecute({ requestPolicy: 'network-only' }), POLL_EVERY_MS)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      if (!cancelled) setPhase('stalled')
    }, POLL_FOR_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [phase, id, notFound, confirmPayment, reexecute])

  const complete = async (outcome: Outcome) => {
    setNotice(null)
    const result = await pretend({ id, outcome })
    if (result.error || !result.data) {
      setNotice(result.error?.graphQLErrors[0]?.message ?? 'The sandbox didn’t answer. Checking with the provider instead.')
      setPhase('confirming')
      return
    }
    // A successful pretend payment settles in the same call; a failed one leaves nothing for polling to find.
    setPhase(result.data.sandboxCompleteCheckout.status === 'PENDING_PAYMENT' ? 'stalled' : 'confirming')
  }

  // Only offered while stalled, so moving back to confirming restarts the effect above.
  const checkAgain = () => {
    setNotice(null)
    setPhase('confirming')
  }

  const payAgain = async () => {
    const result = await retryCheckout({ id })
    const checkout = result.data?.retryBountyCheckout
    if (checkout?.checkoutUrl) {
      try {
        await openCheckout(router, id, checkout.checkoutUrl)
        return
      } catch {
        // The provider page didn't open; the message below says to try again.
      }
    }
    // No new checkout because the money had arrived after all: the outcome effect takes it from here.
    if (checkout && checkout.bounty.status !== 'PENDING_PAYMENT') return
    toast(result.error?.graphQLErrors[0]?.message ?? 'We couldn’t open the payment page. Try again in a moment.')
  }

  if (notFound) {
    return (
      <EmptyState
        icon="bounty"
        title="This bounty isn’t available"
        body="It may have been removed, or it isn’t yours."
        action={<Button label="Back to bounties" tone="outline" onPress={() => router.replace('/bounties')} />}
      />
    )
  }

  if (phase === 'sandbox' && bounty?.status === 'PENDING_PAYMENT') {
    const busy = (outcome: Outcome) => pretending && pretendOperation?.variables.outcome === outcome
    return (
      <View style={styles.wrap}>
        <Card style={styles.card}>
          <Txt variant="micro" color="textMuted" accessibilityRole="header">
            Sandbox payment
          </Txt>
          <Txt variant="display">{formatZar(bounty.amountCents)}</Txt>
          <Txt variant="small" color="textMuted">
            No real money moves here. Choose what the payment provider answers.
          </Txt>
          <View style={styles.actions}>
            <Button label="Pay" icon="check" loading={busy('SUCCESS')} disabled={pretending} onPress={() => void complete('SUCCESS')} />
            <Button label="Fail the payment" tone="outline" loading={busy('FAILED')} disabled={pretending} onPress={() => void complete('FAILED')} />
            <Button label="Pay the wrong amount" tone="outline" loading={busy('WRONG_AMOUNT')} disabled={pretending} onPress={() => void complete('WRONG_AMOUNT')} />
          </View>
          {reference ? (
            <Txt variant="small" color="textMuted">
              Reference {reference}
            </Txt>
          ) : null}
        </Card>
      </View>
    )
  }

  if (phase === 'stalled') {
    return (
      <View>
        <EmptyState
          icon="globe"
          title="We haven’t heard back yet"
          body="Your payment may still be processing. We’ll list the bounty as soon as it’s confirmed, and you won’t be charged twice."
          action={
            <View style={styles.actions}>
              <Button label="Check again" onPress={checkAgain} />
              <Button label="Pay again" tone="outline" loading={retrying} onPress={() => void payAgain()} />
              <Button label="My bounties" tone="ghost" onPress={() => router.replace('/bounties/mine')} />
            </View>
          }
        />
        {notice ? (
          <Txt variant="small" style={[styles.note, { color: c.danger }]} accessibilityRole="alert">
            {notice}
          </Txt>
        ) : null}
      </View>
    )
  }

  return (
    <Waiting>
      {notice ? (
        <Txt variant="small" style={{ color: c.danger, textAlign: 'center' }} accessibilityRole="alert">
          {notice}
        </Txt>
      ) : null}
      {error && !data ? (
        <Txt variant="small" color="textMuted" style={{ textAlign: 'center' }}>
          Can’t reach CIVIC/ONE yet. Still trying.
        </Txt>
      ) : null}
    </Waiting>
  )
}

function Waiting({ children }: { children?: ReactNode }) {
  const c = useColors()
  return (
    <View style={styles.waiting} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={c.textMuted} />
      <Txt color="textMuted" style={{ textAlign: 'center', maxWidth: 340 }}>
        Hang on while we confirm your payment. This usually takes a few seconds.
      </Txt>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { padding: 18 },
  card: { padding: 18, gap: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 6 },
  waiting: { alignItems: 'center', gap: 14, paddingVertical: 56, paddingHorizontal: 24 },
  note: { textAlign: 'center', paddingHorizontal: 24, paddingBottom: 24 },
})
