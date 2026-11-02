import type { ProfileMetadataQuery as ProfileMetadata } from '@civic/graphql'
import type { ImmutableRequest } from 'expo-router/server'
import { FollowListScreen } from '@/components/FollowListScreen'
import { FollowingQuery, ProfileMetadataQuery } from '@/graphql/documents'
import { prefetch } from '@/lib/graphql/prefetch'
import { profileHandle, profilePath } from '@/lib/profile'
import { profileMetadata } from '@/lib/profile-metadata'
import { pageMetadata } from '@/lib/seo'
import { followListVariables, param } from '@/lib/variables'

export function loader(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = profileHandle(param(params.handle))
  return handle ? prefetch((fetch) => fetch(FollowingQuery, followListVariables(handle))) : null
}

// Lists of people aren't for search engines; the profile is. The list shares the profile's card.
export async function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = profileHandle(param(params.handle))
  if (!handle) return pageMetadata({ title: 'Not found', path: `/${encodeURIComponent(param(params.handle))}/following`, noindex: true })
  let user: ProfileMetadata['user'] | undefined
  await prefetch(async (fetch) => {
    // The loader runs next and asks for FollowingQuery; starting it now means it doesn't wait.
    const [metadata] = await Promise.all([fetch(ProfileMetadataQuery, { handle }), fetch(FollowingQuery, followListVariables(handle))])
    user = metadata?.user
  })
  return user ? profileMetadata(user, 'following') : pageMetadata({ title: 'Account not found', path: profilePath(handle, 'following'), noindex: true })
}

export default function FollowingScreen() {
  return <FollowListScreen list="following" />
}
