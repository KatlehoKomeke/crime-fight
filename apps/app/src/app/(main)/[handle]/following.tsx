import type { ImmutableRequest } from 'expo-router/server'
import { FollowListScreen } from '@/components/FollowListScreen'
import { FollowingQuery } from '@/graphql/documents'
import { prefetch } from '@/lib/graphql/prefetch'
import { profileHandle, profilePath } from '@/lib/profile'
import { pageMetadata } from '@/lib/seo'
import { followListVariables, param } from '@/lib/variables'

export function loader(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = profileHandle(param(params.handle))
  return handle ? prefetch((fetch) => fetch(FollowingQuery, followListVariables(handle))) : null
}

// Lists of people aren't for search engines; the profile is.
export async function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const handle = profileHandle(param(params.handle))
  if (!handle) return pageMetadata({ title: 'Not found', path: `/${encodeURIComponent(param(params.handle))}/following`, noindex: true })
  let user: { handle: string; displayName: string } | null | undefined
  await prefetch(async (fetch) => {
    user = (await fetch(FollowingQuery, followListVariables(handle)))?.user
  })
  if (!user) return pageMetadata({ title: 'Account not found', path: profilePath(handle, 'following'), noindex: true })
  return pageMetadata({ title: `People followed by ${user.displayName} (@${user.handle})`, path: profilePath(user.handle, 'following'), noindex: true })
}

export default function FollowingScreen() {
  return <FollowListScreen list="following" />
}
