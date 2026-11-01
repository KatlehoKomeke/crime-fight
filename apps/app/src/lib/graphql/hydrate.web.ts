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
 * (liked, saved, following) with anonymous ones. A screen that mounts signed
 * in skips its loader altogether, so a client-side navigation doesn't wait for
 * a payload it would discard before the screen's own queries can start.
 *
 * It must run during render (an effect would run after the queries) and once
 * per payload, hence React's "adjust state when props change" pattern.
 */
export function useHydrate(): void {
  const { identity } = useAuth()
  // Fixed when the screen mounts, so this screen calls the same hooks on every render.
  const [anonymous] = useState(identity === 'anon')
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (anonymous) useLoaderPayload(identity)
}

function useLoaderPayload(identity: string): void {
  const data = useLoaderData() as PrefetchedData | undefined
  const ssr = useSsr()
  const [restored, setRestored] = useState<PrefetchedData | undefined>(undefined)
  if (data?.urql && restored !== data && identity === 'anon') {
    ssr.restoreData(data.urql)
    setRestored(data)
  }
}
