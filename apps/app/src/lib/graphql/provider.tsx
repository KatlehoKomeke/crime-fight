import { type SSRData, type SSRExchange, ssrExchange } from '@urql/core'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react'
import { Provider } from 'urql'
import { useAuth } from '../auth'
import { getConfig, isServer } from '../config'
import { createRealtimeClient, type RealtimeClient } from '../realtime'
import { createGraphQLClient } from './client'
import type { PrefetchedData } from './prefetch'

const SsrContext = createContext<SSRExchange | null>(null)
const RealtimeContext = createContext<RealtimeClient | null>(null)

export function useSsr(): SSRExchange {
  const ssr = useContext(SsrContext)
  if (!ssr) throw new Error('useSsr must be used inside <GraphQLProvider>')
  return ssr
}

/** Calls `refetch` whenever the realtime connection comes back after dropping, to catch up on missed events. */
export function useRealtimeReconnect(refetch: () => void) {
  const realtime = useContext(RealtimeContext)
  const latest = useRef(refetch)
  useEffect(() => {
    latest.current = refetch
  })
  useEffect(() => realtime?.onReconnect(() => latest.current()), [realtime])
}

/**
 * The loader payloads embedded in the first page's HTML (web only). The app
 * shell hydrates while the route's code is still loading, before the route's
 * `useHydrate` runs, so the right rail would otherwise hydrate without the
 * data the server rendered it with.
 */
function pageLoaderData(): SSRData | undefined {
  const pages = (globalThis as { __EXPO_ROUTER_LOADER_DATA__?: Record<string, PrefetchedData | undefined> }).__EXPO_ROUTER_LOADER_DATA__
  return pages ? Object.assign({}, ...Object.values(pages).map((page) => page?.urql)) : undefined
}

/**
 * One urql client per signed-in identity: signing in/out swaps the client, so
 * viewer-specific fields (liked, saved, following) can never leak between
 * sessions from the cache. The realtime connection is per identity too.
 */
export function GraphQLProvider({ children }: { children: ReactNode }) {
  const { identity, bridge } = useAuth()
  const value = useMemo(() => {
    const config = getConfig()
    // Loader payloads are anonymous, like useHydrate's.
    const ssr = ssrExchange({ isClient: !isServer, initialState: !isServer && identity === 'anon' ? pageLoaderData() : undefined })
    const realtime = !isServer && config.realtime ? createRealtimeClient({ ...config.realtime, auth: bridge }) : null
    const client = createGraphQLClient({ url: config.apiUrl, ssr, auth: bridge, offline: isServer, persisted: config.persistedQueries, realtime })
    return { ssr, client, realtime }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity])
  useEffect(() => () => value.realtime?.close(), [value])

  return (
    <SsrContext.Provider value={value.ssr}>
      <RealtimeContext.Provider value={value.realtime}>
        <Provider value={value.client}>{children}</Provider>
      </RealtimeContext.Provider>
    </SsrContext.Provider>
  )
}
