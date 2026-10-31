import { formatCount, TRUST_BADGE_LABEL, type TrustBadge } from '@civic/core'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { StyleSheet, View } from 'react-native'
import { FollowButton } from '@/components/FollowButton'
import { PostList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { Avatar, Button, EmptyState, Skeleton, TrustChip, Txt, VerifiedBadge } from '@/components/ui'
import { ProfileQuery } from '@/graphql/documents'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { excerpt, pageMetadata } from '@/lib/seo'
import { PAGE_SIZE, param } from '@/lib/variables'
import { brand, useColors } from '@/theme'

const variables = (handle: string) => ({ handle, first: PAGE_SIZE })

export function loader(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  return prefetch((fetch) => fetch(ProfileQuery, variables(param(params.handle))))
}

export async function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = param(params.handle)
  let user: { displayName: string; bio: string; trustBadge: string | null } | null | undefined
  await prefetch(async (fetch) => {
    user = (await fetch(ProfileQuery, variables(handle)))?.user
  })
  if (!user) return pageMetadata({ title: 'Account not found', path: `/u/${handle}`, noindex: true })
  const badge = user.trustBadge ? ` · ${TRUST_BADGE_LABEL[user.trustBadge as TrustBadge]}` : ''
  return pageMetadata({ title: `${user.displayName} (@${handle})${badge}`, description: excerpt(user.bio || `Updates from @${handle} on CIVIC/ONE.`), path: `/u/${handle}`, type: 'profile' })
}

export default function ProfileScreen() {
  useHydrate()
  const c = useColors()
  const router = useRouter()
  const handle = param(useLocalSearchParams<{ handle: string }>().handle)
  const profile = usePaginatedQuery(ProfileQuery, variables(handle), (data) => data?.user?.posts)
  const user = profile.data?.user

  if (!user && !profile.loading) {
    return (
      <Screen title="Account not found" header={<PageHeader title="Profile" back />}>
        <EmptyState icon="profile" title="This account doesn’t exist" body={`Nobody is using @${handle} yet.`} action={<Button label="Back to feed" tone="outline" onPress={() => router.replace('/')} />} />
      </Screen>
    )
  }

  return (
    <Screen title={user ? `${user.displayName} (@${user.handle})` : `@${handle}`} header={<PageHeader title={user?.displayName ?? `@${handle}`} subtitle={user ? `${formatCount(user.postCount)} posts` : undefined} back />}>
      <PostList
        {...profile}
        loading={profile.loading}
        onEndReached={profile.loadMore}
        onRefresh={profile.refresh}
        header={
          <View style={{ borderBottomWidth: 1, borderBottomColor: c.line }}>
            <View style={[styles.banner, { backgroundColor: user?.verified ? brand.lime : c.surfaceAlt }]}>
              <View style={[styles.bannerStripe, { backgroundColor: brand.ink }]} />
            </View>
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={[styles.avatarRing, { borderColor: c.surface }]}>
                  {user ? <Avatar initials={user.initials} url={user.avatarUrl} size={88} official={user.verified && user.role !== 'MEMBER'} /> : <Skeleton width={88} height={88} style={{ borderRadius: 44 }} />}
                </View>
                {user?.isViewer ? (
                  // Settings holds profile editing and sign-out; phones have no rail link to it.
                  <Button label="Settings" tone="outline" size="sm" icon="settings" onPress={() => router.push('/settings')} />
                ) : user ? (
                  <FollowButton userId={user.id} following={user.viewerIsFollowing} name={user.displayName} size="md" />
                ) : null}
              </View>
              {user ? (
                <>
                  <View style={styles.nameRow}>
                    <Txt variant="display">{user.displayName}</Txt>
                    {user.verified ? <VerifiedBadge size={18} /> : null}
                  </View>
                  <Txt variant="small" color="textMuted">
                    @{user.handle}
                  </Txt>
                  {user.trustBadge ? (
                    <View style={{ marginTop: 10 }}>
                      <TrustChip badge={user.trustBadge as TrustBadge} />
                    </View>
                  ) : null}
                  {user.bio ? <Txt style={{ marginTop: 12 }}>{user.bio}</Txt> : null}
                  <View style={styles.stats}>
                    <Txt variant="small" color="textMuted">
                      <Txt variant="smallStrong">{formatCount(user.followingCount)}</Txt> following
                    </Txt>
                    <Txt variant="small" color="textMuted">
                      <Txt variant="smallStrong">{formatCount(user.followerCount)}</Txt> followers
                    </Txt>
                    <Txt variant="small" color="textMuted">
                      Joined {new Date(user.createdAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })}
                    </Txt>
                  </View>
                </>
              ) : (
                <View style={{ gap: 10, marginTop: 8 }}>
                  <Skeleton width="40%" height={18} />
                  <Skeleton width="25%" />
                </View>
              )}
            </View>
          </View>
        }
        empty={<EmptyState icon="comment" title="No posts yet" body="When this account shares an update it will show up here." />}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  banner: { height: 132, overflow: 'hidden' },
  bannerStripe: { position: 'absolute', right: -40, top: 0, bottom: 0, width: 180, transform: [{ skewX: '-18deg' }], opacity: 0.92 },
  hero: { paddingHorizontal: 18, paddingBottom: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -44 },
  avatarRing: { borderWidth: 4, borderRadius: 50 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
})
