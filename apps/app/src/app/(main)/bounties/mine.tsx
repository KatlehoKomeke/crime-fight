import type { BountyStatus } from '@civic/core'
import type { MyBountiesQuery as MyBounties } from '@civic/graphql'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useMutation } from 'urql'
import { BountyRow } from '@/components/bounties/BountyRow'
import { ClaimRow } from '@/components/bounties/ClaimRow'
import { FeedList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Button, EmptyState, Txt } from '@/components/ui'
import { MyBountiesQuery, MyClaimsQuery, RetryBountyCheckout } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { openCheckout } from '@/lib/checkout'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { usePaymentsStatus } from '@/lib/payments'
import { pageMetadata } from '@/lib/seo'
import { PAGE_SIZE, param } from '@/lib/variables'
import { brand, fonts, useColors } from '@/theme'

export function generateMetadata() {
  return pageMetadata({ title: 'My bounties', path: '/bounties/mine', noindex: true })
}

type Tab = 'posted' | 'claims'

const TABS: Array<{ tab: Tab; label: string }> = [
  { tab: 'posted', label: 'Posted' },
  { tab: 'claims', label: 'Claims' },
]

type MyBounty = MyBounties['myBounties']['edges'][number]['node']

/** Why the API gave no checkout: the bounty isn't waiting for payment any more, or the provider wouldn't open one. */
function noCheckoutMessage(status: BountyStatus | undefined): string {
  switch (status) {
    case undefined:
    case 'PENDING_PAYMENT':
      return 'Couldn’t open a checkout right now. Try again in a moment.'
    case 'ABANDONED':
      return 'This checkout ran out of time, so the bounty was never paid for. Post it again if you still want it.'
    default:
      return 'Your payment already went through, so there’s nothing more to pay.'
  }
}

/** `/bounties/mine`: the rewards you posted, and under the Claims tab (`?tab=claims`) the claims you sent. */
export default function MyBountiesScreen() {
  const router = useRouter()
  const toast = useToast()
  const { status } = useAuth()
  const payments = usePaymentsStatus()
  const tab: Tab = param(useLocalSearchParams<{ tab?: string }>().tab) === 'claims' ? 'claims' : 'posted'
  const signedIn = status === 'signed-in'
  // Each tab shows one list; the other query stays paused.
  const posted = usePaginatedQuery(MyBountiesQuery, { first: PAGE_SIZE }, (data) => data?.myBounties, { pause: !signedIn || tab !== 'posted' })
  const claims = usePaginatedQuery(MyClaimsQuery, { first: PAGE_SIZE }, (data) => data?.myClaims, { pause: !signedIn || tab !== 'claims' })
  const [, retryCheckout] = useMutation(RetryBountyCheckout)
  const [payingId, setPayingId] = useState<string | null>(null)

  const pay = async (id: string) => {
    setPayingId(id)
    try {
      const result = await retryCheckout({ id })
      const checkout = result.data?.retryBountyCheckout
      if (checkout?.checkoutUrl) await openCheckout(router, id, checkout.checkoutUrl)
      else toast(result.error?.graphQLErrors[0]?.message ?? noCheckoutMessage(checkout?.bounty.status))
    } finally {
      setPayingId(null)
    }
  }

  return (
    <Screen
      title="My bounties"
      header={
        <PageHeader title="My bounties">
          <Tabs active={tab} onChange={(next) => router.setParams({ tab: next === 'claims' ? 'claims' : undefined })} />
        </PageHeader>
      }
    >
      {status === 'signed-out' ? (
        <EmptyState
          icon="lock"
          title="Your bounties live here"
          body="Sign in to see the rewards you’ve posted and the claims you’ve sent."
          action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      ) : tab === 'claims' ? (
        <FeedList
          {...claims}
          // The session is read on the device, so the server render and first paint don't know it yet.
          loading={claims.loading || status === 'loading'}
          renderItem={(claim) => <ClaimRow claim={claim} />}
          onEndReached={claims.loadMore}
          onRefresh={claims.refresh}
          empty={<EmptyState icon="bounty" title="No claims yet" body="If you have information that honours a bounty, send a claim from its page." />}
        />
      ) : (
        <FeedList
          {...posted}
          loading={posted.loading || status === 'loading'}
          renderItem={(bounty) => (
            <PostedRow bounty={bounty} canPay={payments.enabled} paying={payingId === bounty.id} disabled={payingId !== null} onPay={() => void pay(bounty.id)} />
          )}
          onEndReached={posted.loadMore}
          onRefresh={posted.refresh}
          empty={
            <EmptyState
              icon="bounty"
              title="You haven’t posted a bounty"
              body="When you post a reward, you’ll manage it from here."
              action={payments.enabled ? <Button label="Post a bounty" icon="bounty" onPress={() => router.push('/bounties/new')} /> : undefined}
            />
          }
        />
      )}
    </Screen>
  )
}

/** A bounty you posted, with what it needs from you: paying for it, or answering the claims waiting on it. */
function PostedRow({ bounty, canPay, paying, disabled, onPay }: { bounty: MyBounty; canPay: boolean; paying: boolean; disabled: boolean; onPay: () => void }) {
  const c = useColors()
  // The poster sees a claim once CIVIC/ONE approves it, and then it waits for their answer.
  const waiting = bounty.claims.filter((claim) => claim.status === 'APPROVED').length
  return (
    <BountyRow bounty={bounty}>
      {bounty.status === 'PENDING_PAYMENT' && canPay ? (
        <View style={styles.action}>
          <Button size="sm" label="Pay now" accessibilityLabel={`Pay now for ${bounty.title}`} loading={paying} disabled={disabled} onPress={onPay} />
        </View>
      ) : null}
      {waiting > 0 ? (
        <Txt variant="small" style={{ color: c.warning }}>
          {waiting} {waiting === 1 ? 'claim' : 'claims'} waiting for your answer
        </Txt>
      ) : null}
      {bounty.status === 'AWAITING_VERIFICATION' ? (
        <Txt variant="small" style={{ color: c.warning }}>
          CIVIC/ONE is verifying a claim
        </Txt>
      ) : null}
    </BountyRow>
  )
}

function Tabs({ active, onChange }: { active: Tab; onChange: (tab: Tab) => void }) {
  const c = useColors()
  return (
    <View style={styles.tabs} role="tablist">
      {TABS.map((item) => {
        const selected = item.tab === active
        return (
          <Pressable
            key={item.tab}
            role="tab"
            aria-selected={selected}
            accessibilityState={{ selected }}
            onPress={() => !selected && onChange(item.tab)}
            style={({ hovered }) => [styles.tab, hovered && { backgroundColor: c.surfaceAlt }]}
          >
            <Txt style={[styles.tabText, { color: selected ? c.text : c.textMuted, fontFamily: selected ? fonts.bold : fonts.semibold }]}>{item.label}</Txt>
            {selected ? <View style={[styles.underline, { backgroundColor: brand.lime, borderTopColor: c.text }]} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  tabs: { height: 48, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14 },
  underline: { position: 'absolute', bottom: 0, width: 54, height: 4, borderRadius: 3, borderTopWidth: 1 },
  action: { flexDirection: 'row', marginTop: 6 },
})
