import { formatCount } from '@civic/core'
import { useLocalSearchParams } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { Platform, StyleSheet, View } from 'react-native'
import { HoverLink } from '@/components/HoverLink'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from 'urql'
import { PostList } from '@/components/PostList'
import { Screen } from '@/components/Screen'
import { SearchBox } from '@/components/shell/RightRail'
import { EmptyState, Skeleton, Txt } from '@/components/ui'
import { UserRow } from '@/components/UserRow'
import { SearchQuery, TrendsQuery } from '@/graphql/documents'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { pageMetadata } from '@/lib/seo'
import { PAGE_SIZE, param } from '@/lib/variables'
import { sticky, useColors } from '@/theme'

const queryFrom = (request?: ImmutableRequest) => (request ? (new URL(request.url).searchParams.get('q') ?? '').trim() : '')

export function loader(request: ImmutableRequest | undefined) {
  const q = queryFrom(request)
  return prefetch((fetch) => (q.length > 1 ? fetch(SearchQuery, { query: q, first: PAGE_SIZE }) : fetch(TrendsQuery, {})))
}

export function generateMetadata(request: ImmutableRequest | undefined) {
  const q = queryFrom(request)
  return pageMetadata({ title: q ? `Search: ${q}` : 'Explore', description: 'Search verified local updates, topics and trusted sources.', path: '/explore', noindex: Boolean(q) })
}

export default function ExploreScreen() {
  useHydrate()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const q = param(useLocalSearchParams<{ q?: string }>().q).trim()

  return (
    <Screen
      title={q ? `Search: ${q}` : 'Explore'}
      header={
        <View style={[styles.header, sticky, { backgroundColor: c.headerBg, borderBottomColor: c.line, paddingTop: Platform.OS === 'web' ? 10 : insets.top + 8 }]}>
          <SearchBox key={q} initial={q} />
        </View>
      }
    >
      {q.length > 1 ? <Results query={q} /> : <Trends />}
    </Screen>
  )
}

function Results({ query }: { query: string }) {
  const c = useColors()
  const results = usePaginatedQuery(SearchQuery, { query, first: PAGE_SIZE }, (data) => data?.search)
  const people = results.data?.searchUsers ?? []
  return (
    <PostList
      {...results}
      onEndReached={results.loadMore}
      onRefresh={results.refresh}
      header={
        people.length ? (
          <View style={{ borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 6 }}>
            <Txt variant="micro" color="textMuted" style={styles.section}>
              People
            </Txt>
            {people.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
            <Txt variant="micro" color="textMuted" style={[styles.section, { marginTop: 8 }]}>
              Posts
            </Txt>
          </View>
        ) : null
      }
      empty={<EmptyState icon="search" title={`No results for “${query}”`} body="Try a place, a topic like #SafeWalk, or a source’s name." />}
    />
  )
}

function Trends() {
  const c = useColors()
  const [{ data }] = useQuery({ query: TrendsQuery })
  return (
    <View>
      <Txt variant="title" style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 6 }} accessibilityRole="header">
        Trending in your area
      </Txt>
      {data
        ? data.trends.map((trend, index) => (
            <HoverLink key={trend.topic.id} href={`/topic/${trend.topic.slug}`} style={[styles.trend, { borderBottomColor: c.line }]} hoverStyle={{ backgroundColor: c.bg }}>
              <Txt variant="display" color="textMuted" style={{ width: 28 }}>
                {index + 1}
              </Txt>
              <View style={{ flex: 1 }}>
                <Txt variant="micro" color="textMuted">
                  {trend.topic.category}
                </Txt>
                <Txt variant="bodyStrong">#{trend.topic.title}</Txt>
                <Txt variant="small" color="textMuted">
                  {formatCount(trend.postCount)} posts this week
                </Txt>
              </View>
            </HoverLink>
          ))
        : [0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.trend, { borderBottomColor: c.line, gap: 8, flexDirection: 'column' }]}>
              <Skeleton width="25%" height={9} />
              <Skeleton width="55%" />
            </View>
          ))}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { zIndex: 20, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1 },
  section: { paddingHorizontal: 18, paddingVertical: 6 },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
})
