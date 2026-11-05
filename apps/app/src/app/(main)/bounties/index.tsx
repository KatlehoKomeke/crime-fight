import { type BountyKind, PREVIEW_PAGES, previewPageImage } from '@civic/core'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BountyRow } from '@/components/bounties/BountyRow'
import { ComingSoon } from '@/components/bounties/ComingSoon'
import { KindChips } from '@/components/bounties/KindChips'
import { MessagesButton } from '@/components/messages/inbox'
import { FeedList } from '@/components/PostList'
import { MobileBrand, Screen } from '@/components/Screen'
import { Button, EmptyState, Txt } from '@/components/ui'
import { BountiesQuery } from '@/graphql/documents'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { useLoadedPaymentsStatus } from '@/lib/payments'
import { pageMetadata } from '@/lib/seo'
import { useRequireAuth } from '@/lib/use-require-auth'
import { type BoardTab, boardFilters, boardVariables } from '@/lib/variables'
import { brand, fonts, sticky, useColors } from '@/theme'

/** The loader reads the same two query parameters the screen reads, so both build the same variables to the byte. */
function filtersFrom(request?: ImmutableRequest) {
  const search = request ? new URL(request.url).searchParams : null
  return boardFilters({ tab: search?.get('tab') ?? undefined, kind: search?.get('kind') ?? undefined })
}

export function loader(request: ImmutableRequest | undefined) {
  return prefetch((fetch) => fetch(BountiesQuery, boardVariables(filtersFrom(request))))
}

export function generateMetadata() {
  return pageMetadata({ title: 'Bounties', description: PREVIEW_PAGES.bounties.description, path: '/bounties', image: previewPageImage('bounties') })
}

const TABS: Array<{ tab: BoardTab; label: string }> = [
  { tab: 'open', label: 'Open' },
  { tab: 'honoured', label: 'Honoured' },
]

export default function BountiesScreen() {
  useHydrate()
  const router = useRouter()
  const gate = useRequireAuth()
  // From the loader, so the banner below is in the server HTML and hydration agrees with it.
  const payments = useLoadedPaymentsStatus()
  const filters = boardFilters(useLocalSearchParams<{ tab?: string; kind?: string }>())
  const board = usePaginatedQuery(BountiesQuery, boardVariables(filters), (data) => data?.bounties)

  // The URL is the state (`/bounties?tab=honoured&kind=PROPERTY`), so a filtered board can be linked to
  // and the loader sees the filters. The defaults (open, all kinds) leave the URL clean.
  const setTab = (tab: BoardTab) => router.setParams({ tab: tab === 'honoured' ? 'honoured' : undefined })
  const setKind = (kind: BountyKind | null) => router.setParams({ kind: kind ?? undefined })

  const empty = filters.kind ? (
    <EmptyState icon="bounty" title="Nothing matches" body="Try another kind, or clear the filters." action={<Button label="Clear filters" tone="outline" onPress={() => setKind(null)} />} />
  ) : filters.tab === 'honoured' ? (
    <EmptyState icon="bounty" title="Nothing honoured yet" body="Bounties that have been paid out will be listed here." />
  ) : (
    <EmptyState
      icon="bounty"
      title="No open bounties"
      body="When someone posts a reward for a recovery, a safe return or information to SAPS, it shows up here."
      action={payments.enabled ? <Button label="Post a bounty" icon="bounty" onPress={gate(() => router.push('/bounties/new'), 'Sign in to post a bounty')} /> : undefined}
    />
  )

  return (
    <Screen title={filters.tab === 'honoured' ? 'Honoured bounties' : 'Bounties'} header={<BoardHeader tab={filters.tab} kind={filters.kind} onTab={setTab} onKind={setKind} />}>
      {payments.known && !payments.enabled ? <ComingSoon /> : null}
      <FeedList {...board} renderItem={(bounty) => <BountyRow bounty={bounty} />} onEndReached={board.loadMore} onRefresh={board.refresh} empty={empty} />
    </Screen>
  )
}

function BoardHeader({ tab, kind, onTab, onKind }: { tab: BoardTab; kind: BountyKind | null; onTab: (tab: BoardTab) => void; onKind: (kind: BountyKind | null) => void }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.header, sticky, { backgroundColor: c.headerBg, borderBottomColor: c.line, paddingTop: Platform.OS === 'web' ? 0 : insets.top }]}>
      <View style={styles.row}>
        <View style={styles.brand}>
          <MobileBrand />
        </View>
        <View style={styles.tabs} role="tablist">
          {TABS.map((item) => {
            const active = item.tab === tab
            return (
              <Pressable
                key={item.tab}
                role="tab"
                aria-selected={active}
                accessibilityState={{ selected: active }}
                onPress={() => !active && onTab(item.tab)}
                style={({ hovered }) => [styles.tab, hovered && { backgroundColor: c.surfaceAlt }]}
              >
                <Txt style={[styles.tabText, { color: active ? c.text : c.textMuted, fontFamily: active ? fonts.bold : fonts.semibold }]}>{item.label}</Txt>
                {active ? <View style={[styles.underline, { backgroundColor: brand.lime, borderTopColor: c.text }]} /> : null}
              </Pressable>
            )
          })}
        </View>
        <MessagesButton />
      </View>
      <View style={[styles.filters, { borderTopColor: c.line }]}>
        <KindChips all value={kind} onChange={onKind} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { zIndex: 20, borderBottomWidth: 1, ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(12px)' } as object) : null) },
  row: { height: 56, flexDirection: 'row', alignItems: 'stretch' },
  brand: { justifyContent: 'center', paddingLeft: 8 },
  tabs: { flex: 1, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14 },
  underline: { position: 'absolute', bottom: 0, width: 54, height: 4, borderRadius: 3, borderTopWidth: 1 },
  filters: { paddingVertical: 12, paddingHorizontal: 18, borderTopWidth: 1 },
})
