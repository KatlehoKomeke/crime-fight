import type { BountyDetailFieldsFragment } from '@civic/graphql'
import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { useMutation } from 'urql'
import { RetryBountyCheckout } from '@/graphql/documents'
import { bountyStatusLabel, bountyStatusLine, bountyTone, toneColor } from '@/lib/bounty-copy'
import { openCheckout } from '@/lib/checkout'
import { usePaymentsStatus } from '@/lib/payments'
import { useColors } from '@/theme'
import { useToast } from '../Toast'
import { Button, Txt } from '../ui'

/**
 * Asks the API for a fresh checkout and hands the poster to it. The API may
 * find the bounty was paid after all, in which case there is nothing to open.
 */
export function usePayNow(bountyId: string) {
  const router = useRouter()
  const toast = useToast()
  const [{ fetching }, retry] = useMutation(RetryBountyCheckout)

  const payNow = async () => {
    const result = await retry({ id: bountyId })
    const checkout = result.data?.retryBountyCheckout
    if (checkout?.checkoutUrl) {
      await openCheckout(router, bountyId, checkout.checkoutUrl)
    } else if (checkout && checkout.bounty.status !== 'PENDING_PAYMENT') {
      toast('Your payment went through. The bounty is paid in.')
    } else {
      toast(result.error?.graphQLErrors[0]?.message ?? 'We couldn’t open the payment page. Try again in a moment.')
    }
  }

  return { payNow: () => void payNow(), paying: fetching }
}

/** Where the bounty stands, in the look of an alert card: a toned edge, a dot that pulses only while it's open. */
export function StatusStrip({ bounty, poster, admin }: { bounty: BountyDetailFieldsFragment; poster: boolean; admin: boolean }) {
  const c = useColors()
  const payments = usePaymentsStatus()
  const { payNow, paying } = usePayNow(bounty.id)
  const tone = toneColor(bountyTone(bounty.status, bounty.isExpired), c)
  const live = bounty.status === 'OPEN' && !bounty.isExpired
  const unpaid = bounty.status === 'PENDING_PAYMENT' && (poster || admin)
  const label = unpaid ? 'Not paid yet' : bountyStatusLabel(bounty)
  const line = unpaid ? 'Listed once it’s paid for' : bounty.status === 'FROZEN' ? 'Being reviewed by CIVIC/ONE' : bountyStatusLine(bounty)

  return (
    <View style={[styles.strip, { borderColor: c.line, borderLeftColor: tone, backgroundColor: c.bg }]} accessibilityRole="summary">
      <View style={styles.text}>
        <View dataSet={live ? { pulse: true } : undefined} style={[styles.dot, { backgroundColor: tone }]} />
        <Txt variant="small" color="textMuted" style={{ flexShrink: 1 }}>
          <Txt variant="micro" style={{ color: tone }}>
            {label}
          </Txt>
          {' · '}
          {line}
        </Txt>
      </View>
      {unpaid && poster && payments.enabled ? <Button label="Pay now" size="sm" loading={paying} onPress={payNow} /> : null}
      {unpaid && poster && payments.known && !payments.enabled ? (
        <Txt variant="small" color="textMuted">
          Payments aren’t switched on yet
        </Txt>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    marginHorizontal: 18,
    marginTop: 14,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  text: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
})
