import type { ProfileMetadataQuery as ProfileMetadata } from '@civic/graphql'
import type { ImmutableRequest } from 'expo-router/server'
import { FollowListScreen } from '@/components/FollowListScreen'
import { FollowersQuery, ProfileMetadataQuery } from '@/graphql/documents'
import { prefetch } from '@/lib/graphql/prefetch'
import { profileHandle, profilePath } from '@/lib/profile'
import { profileMetadata } from '@/lib/profile-metadata'
import { pageMetadata } from '@/lib/seo'
import { followListVariables, param } from '@/lib/variables'

export function loader(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = profileHandle(param(params.handle))
  return handle ? prefetch((fetch) => fetch(FollowersQuery, followListVariables(handle))) : null
}

// Lists of people aren't for search engines; the profile is. The list shares the profile's card.
export async function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = profileHandle(param(params.handle))
  if (!handle) return pageMetadata({ title: 'Not found', path: `/${encodeURIComponent(param(params.handle))}/followers`, noindex: true })
  let user: ProfileMetadata['user'] | undefined
  await prefetch(async (fetch) => {
    // The loader runs next and asks for FollowersQuery; starting it now means it doesn't wait.
    const [metadata] = await Promise.all([fetch(ProfileMetadataQuery, { handle }), fetch(FollowersQuery, followListVariables(handle))])
    user = metadata?.user
  })
  return user ? profileMetadata(user, 'followers') : pageMetadata({ title: 'Account not found', path: profilePath(handle, 'followers'), noindex: true })
}

export default function FollowersScreen() {
  return <FollowListScreen list="followers" />
}
