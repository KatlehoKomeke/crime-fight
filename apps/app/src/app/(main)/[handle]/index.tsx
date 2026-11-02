import { formatCount, type TrustBadge } from '@civic/core'
import type { ProfileMetadataQuery as ProfileMetadata } from '@civic/graphql'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { FollowButton } from '@/components/FollowButton'
import { MessageButton } from '@/components/messages/MessageButton'
import { NotFound } from '@/components/NotFound'
import { PostList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { Avatar, Button, EmptyState, Skeleton, TrustChip, Txt, VerifiedBadge } from '@/components/ui'
import { ProfileMetadataQuery, ProfileQuery } from '@/graphql/documents'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { profileHandle, profilePath } from '@/lib/profile'
import { profileMetadata } from '@/lib/profile-metadata'
import { pageMetadata } from '@/lib/seo'
import { PAGE_SIZE, param } from '@/lib/variables'
import { brand, useColors } from '@/theme'

const variables = (handle: string) => ({ handle, first: PAGE_SIZE })

export function loader(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = profileHandle(param(params.handle))
  return handle ? prefetch((fetch) => fetch(ProfileQuery, variables(handle))) : null
}

export async function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const segment = param(params.handle)
  const handle = profileHandle(segment)
  if (!handle) return pageMetadata({ title: 'Not found', path: `/${encodeURIComponent(segment)}`, noindex: true })
  let user: ProfileMetadata['user'] | undefined
  await prefetch(async (fetch) => {
    // The loader runs next and asks for ProfileQuery; starting it now means it doesn't wait.
    const [metadata] = await Promise.all([fetch(ProfileMetadataQuery, { handle }), fetch(ProfileQuery, variables(handle))])
    user = metadata?.user
  })
  return user ? profileMetadata(user) : pageMetadata({ title: 'Account not found', path: profilePath(handle), noindex: true })
}

export default function ProfileRoute() {
  const handle = profileHandle(param(useLocalSearchParams<{ handle: string }>().handle))
  return handle ? <ProfileScreen handle={handle} /> : <NotFound />
}

function ProfileScreen({ handle }: { handle: string }) {
  useHydrate()
  const c = useColors()
  const router = useRouter()
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
                  <View style={styles.actions}>
                    {/* Messages are open only between people who follow each other. */}
                    {user.viewerCanMessage ? <MessageButton userId={user.id} name={user.displayName} /> : null}
                    <FollowButton userId={user.id} following={user.viewerIsFollowing} name={user.displayName} size="md" />
                  </View>
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
                    <CountLink href={profilePath(user.handle, 'following')} count={user.followingCount} label="following" />
                    <CountLink href={profilePath(user.handle, 'followers')} count={user.followerCount} label={user.followerCount === 1 ? 'follower' : 'followers'} />
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

/** A follow count that opens the list behind it, underlined on hover like other links. */
function CountLink({ href, count, label }: { href: string; count: number; label: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link href={href} asChild>
      <Pressable onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}>
        <Txt variant="small" color="textMuted" style={hovered && styles.hovered}>
          <Txt variant="smallStrong">{formatCount(count)}</Txt> {label}
        </Txt>
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  banner: { height: 132, overflow: 'hidden' },
  bannerStripe: { position: 'absolute', right: -40, top: 0, bottom: 0, width: 180, transform: [{ skewX: '-18deg' }], opacity: 0.92 },
  hero: { paddingHorizontal: 18, paddingBottom: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -44 },
  avatarRing: { borderWidth: 4, borderRadius: 50 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  hovered: { textDecorationLine: 'underline' },
})
