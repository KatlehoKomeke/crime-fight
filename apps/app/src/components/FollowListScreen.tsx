import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { FollowersQuery, FollowingQuery } from '@/graphql/documents'
import { useHydrate } from '@/lib/graphql/hydrate'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { type FollowList, profileHandle, profilePath } from '@/lib/profile'
import { followListVariables, param } from '@/lib/variables'
import { brand, fonts, useColors } from '@/theme'
import { NotFound } from './NotFound'
import { FeedList } from './PostList'
import { PageHeader, Screen } from './Screen'
import { UserRow } from './UserRow'
import { Button, EmptyState, Txt } from './ui'

const TABS: Array<{ list: FollowList; label: string }> = [
  { list: 'followers', label: 'Followers' },
  { list: 'following', label: 'Following' },
]

/** `/@handle/followers` and `/@handle/following`: one screen, with a tab for each list. */
export function FollowListScreen({ list }: { list: FollowList }) {
  const handle = profileHandle(param(useLocalSearchParams<{ handle: string }>().handle))
  return handle ? <People handle={handle} list={list} /> : <NotFound />
}

function People({ handle, list }: { handle: string; list: FollowList }) {
  useHydrate()
  const router = useRouter()
  const variables = followListVariables(handle)
  // Each route shows one list; the other query stays paused.
  const followers = usePaginatedQuery(FollowersQuery, variables, (data) => data?.user?.followers, { pause: list !== 'followers' })
  const following = usePaginatedQuery(FollowingQuery, variables, (data) => data?.user?.following, { pause: list !== 'following' })
  const people = list === 'followers' ? followers : following
  const user = people.data?.user

  if (!user && !people.loading && !people.error) {
    return (
      <Screen title="Account not found" header={<PageHeader title="Profile" back />}>
        <EmptyState icon="profile" title="This account doesn’t exist" body={`Nobody is using @${handle} yet.`} action={<Button label="Back to feed" tone="outline" onPress={() => router.replace('/')} />} />
      </Screen>
    )
  }

  const name = user?.displayName ?? `@${handle}`
  const who = user?.isViewer ? 'you' : `@${user?.handle ?? handle}`
  return (
    <Screen
      title={list === 'followers' ? `People following ${name}` : `People followed by ${name}`}
      header={
        <PageHeader title={name} subtitle={user ? `@${user.handle}` : undefined} back>
          <Tabs active={list} onChange={(next) => router.replace(profilePath(user?.handle ?? handle, next))} />
        </PageHeader>
      }
    >
      <FeedList
        {...people}
        renderItem={(person) => <UserRow user={person} />}
        onEndReached={people.loadMore}
        onRefresh={people.refresh}
        empty={
          list === 'followers' ? (
            <EmptyState icon="profile" title="No followers yet" body={`When people follow ${who}, they’ll show up here.`} />
          ) : (
            <EmptyState icon="profile" title="Not following anyone yet" body={user?.isViewer ? 'Accounts you follow show up here.' : `When ${who} follows people, they’ll show up here.`} />
          )
        }
      />
    </Screen>
  )
}

function Tabs({ active, onChange }: { active: FollowList; onChange: (list: FollowList) => void }) {
  const c = useColors()
  return (
    <View style={styles.tabs} role="tablist">
      {TABS.map((item) => {
        const selected = item.list === active
        return (
          <Pressable
            key={item.list}
            role="tab"
            aria-selected={selected}
            accessibilityState={{ selected }}
            onPress={() => !selected && onChange(item.list)}
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
})
