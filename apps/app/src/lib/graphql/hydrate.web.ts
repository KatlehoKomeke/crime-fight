import { useLoaderData } from 'expo-router'
import { useState } from 'react'
import { useAuth } from '../auth'
import type { PrefetchedData } from './prefetch'
import { useSsr } from './provider'

/**
 * Feeds the route loader's prefetched results into urql before the screen's
 * first `useQuery`, so both the server render and hydration read them
 * synchronously. Call it at the top of a screen that exports a `loader`.
 *
 * Loaders always run anonymously (the session lives on the device), so their
 * payload is only applied while the client is anonymous too — otherwise a
 * client-side navigation would overwrite the signed-in user's viewer flags
 * (liked, saved, following) with anonymous ones.
 *
 * It must run during render (an effect would run after the queries) and once
 * per payload, hence React's "adjust state when props change" pattern.
 */
export function useHydrate(): void {
  const data = useLoaderData() as PrefetchedData | undefined
  const ssr = useSsr()
  const { identity } = useAuth()
  const [restored, setRestored] = useState<PrefetchedData | undefined>(undefined)
  if (data?.urql && restored !== data && identity === 'anon') {
    ssr.restoreData(data.urql)
    setRestored(data)
  }
}
