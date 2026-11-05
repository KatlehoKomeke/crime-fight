import type { ProfileMetadataQuery as ProfileMetadata } from '@civic/graphql'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { BountyRow } from '@/components/bounties/BountyRow'
import { NotFound } from '@/components/NotFound'
import { FeedList } from '@/components/PostList'
import { PageHeader, Screen } from '@/components/Screen'
import { Button, EmptyState } from '@/components/ui'
import { ProfileBountiesQuery, ProfileMetadataQuery } from '@/graphql/documents'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { usePaginatedQuery } from '@/lib/graphql/use-paginated'
import { profileHandle, profilePath } from '@/lib/profile'
import { profileMetadata } from '@/lib/profile-metadata'
import { pageMetadata } from '@/lib/seo'
import { followListVariables, param } from '@/lib/variables'

export function loader(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = profileHandle(param(params.handle))
  return handle ? prefetch((fetch) => fetch(ProfileBountiesQuery, followListVariables(handle))) : null
}

// The board is for search engines; a person's list of bounties isn't. The list shares the profile's card.
export async function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = profileHandle(param(params.handle))
  if (!handle) return pageMetadata({ title: 'Not found', path: `/${encodeURIComponent(param(params.handle))}/bounties`, noindex: true })
  let user: ProfileMetadata['user'] | undefined
  await prefetch(async (fetch) => {
    // The loader runs next and asks for ProfileBountiesQuery; starting it now means it doesn't wait.
    const [metadata] = await Promise.all([fetch(ProfileMetadataQuery, { handle }), fetch(ProfileBountiesQuery, followListVariables(handle))])
    user = metadata?.user
  })
  return user ? profileMetadata(user, 'bounties') : pageMetadata({ title: 'Account not found', path: profilePath(handle, 'bounties'), noindex: true })
}

export default function ProfileBountiesRoute() {
  const handle = profileHandle(param(useLocalSearchParams<{ handle: string }>().handle))
  return handle ? <ProfileBountiesScreen handle={handle} /> : <NotFound />
}

/** `/@handle/bounties`: what this person has on the board, or every bounty they posted when it's their own profile (the API decides). */
function ProfileBountiesScreen({ handle }: { handle: string }) {
  useHydrate()
  const router = useRouter()
  const list = usePaginatedQuery(ProfileBountiesQuery, followListVariables(handle), (data) => data?.user?.bounties)
  const user = list.data?.user

  if (!user && !list.loading && !list.error) {
    return (
      <Screen title="Account not found" header={<PageHeader title="Profile" back />}>
        <EmptyState icon="profile" title="This account doesn’t exist" body={`Nobody is using @${handle} yet.`} action={<Button label="Back to feed" tone="outline" onPress={() => router.replace('/')} />} />
      </Screen>
    )
  }

  const name = user?.displayName ?? `@${handle}`
  return (
    <Screen title={`Bounties posted by ${name}`} header={<PageHeader title={name} subtitle="Bounties" back />}>
      <FeedList
        {...list}
        renderItem={(bounty) => <BountyRow bounty={bounty} />}
        onEndReached={list.loadMore}
        onRefresh={list.refresh}
        empty={<EmptyState icon="bounty" title="No bounties" body={user?.isViewer ? 'When you post a reward, it shows up here.' : `When @${user?.handle ?? handle} posts a reward, it shows up here.`} />}
      />
    </Screen>
  )
}
