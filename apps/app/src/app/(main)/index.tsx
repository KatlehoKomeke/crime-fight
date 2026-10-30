import { DEFAULT_CENTER } from '@civic/core'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Composer } from '@/components/Composer'
import { ContextBar } from '@/components/ContextBar'
import { PostList } from '@/components/PostList'
import { MobileBrand, Screen } from '@/components/Screen'
import { useShellMode } from '@/components/shell/use-shell-mode'
import { Button, EmptyState, Txt } from '@/components/ui'
import { FeedQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { useNear } from '@/lib/location'
import { pageMetadata, SITE_NAME } from '@/lib/seo'
import { type FeedKind, feedVariables } from '@/lib/variables'
import { brand, fonts, sticky, useColors } from '@/theme'

export function loader() {
  return prefetch((fetch) => fetch(FeedQuery, feedVariables('FOR_YOU', DEFAULT_CENTER)))
}

export function generateMetadata() {
  return pageMetadata({ title: SITE_NAME, path: '/' })
}

const TABS: Array<{ kind: FeedKind; label: string }> = [
  { kind: 'FOR_YOU', label: 'For you' },
  { kind: 'NEARBY', label: 'Nearby' },
  { kind: 'FOLLOWING', label: 'Following' },
]

export default function HomeScreen() {
  useHydrate()
  const c = useColors()
  const shell = useShellMode()
  const router = useRouter()
  const { status } = useAuth()
  const near = useNear()
  const [tab, setTab] = useState<FeedKind>('FOR_YOU')
  const needsAuth = tab === 'FOLLOWING' && status !== 'signed-in'
  const feed = usePaginatedQuery(FeedQuery, feedVariables(tab, near.point), (data) => data?.feed, { pause: needsAuth })

  return (
    <Screen title={SITE_NAME} header={<FeedHeader tab={tab} onChange={setTab} />}>
      {needsAuth ? (
        <EmptyState
          icon="profile"
          title="Follow the sources you trust"
          body="Sign in to see updates from the newsrooms, officials and neighbours you follow."
          action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      ) : (
        <PostList
          {...feed}
          onEndReached={feed.loadMore}
          onRefresh={feed.refresh}
          header={
            <View>
              {status === 'signed-in' && shell !== 'phone' ? (
                <View dataSet={{ hideMobile: true }} style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
                  <Composer compact />
                </View>
              ) : null}
              <ContextBar />
            </View>
          }
          empty={
            <EmptyState
              icon={tab === 'NEARBY' ? 'location' : 'globe'}
              title={tab === 'NEARBY' ? 'Quiet around here' : 'Nothing yet'}
              body={tab === 'NEARBY' ? 'No updates within 15 km in the last while. That’s good news.' : 'Follow trusted sources to fill this feed.'}
            />
          }
        />
      )}
    </Screen>
  )
}

function FeedHeader({ tab, onChange }: { tab: FeedKind; onChange: (tab: FeedKind) => void }) {
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
            const active = item.kind === tab
            return (
              <Pressable
                key={item.kind}
                role="tab"
                aria-selected={active}
                accessibilityState={{ selected: active }}
                onPress={() => onChange(item.kind)}
                style={({ hovered }) => [styles.tab, hovered && { backgroundColor: c.surfaceAlt }]}
              >
                <View style={styles.tabLabel}>
                  <Txt style={[styles.tabText, { color: active ? c.text : c.textMuted, fontFamily: active ? fonts.bold : fonts.semibold }]}>{item.label}</Txt>
                  {item.kind === 'NEARBY' ? <View style={[styles.nearbyDot, { backgroundColor: brand.coral }]} /> : null}
                </View>
                {active ? <View style={[styles.underline, { backgroundColor: brand.lime, borderTopColor: c.text }]} /> : null}
              </Pressable>
            )
          })}
        </View>
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
  tabLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabText: { fontSize: 14 },
  nearbyDot: { width: 6, height: 6, borderRadius: 3 },
  underline: { position: 'absolute', bottom: 0, width: 54, height: 4, borderRadius: 3, borderTopWidth: 1 },
})
