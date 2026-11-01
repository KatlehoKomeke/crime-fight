import { type SSRExchange, ssrExchange } from '@urql/core'
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react'
import { Provider } from 'urql'
import { useAuth } from '../auth'
import { getConfig, isServer } from '../config'
import { createRealtimeClient, type RealtimeClient } from '../realtime'
import { createGraphQLClient } from './client'

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
 * One urql client per signed-in identity: signing in/out swaps the client, so
 * viewer-specific fields (liked, saved, following) can never leak between
 * sessions from the cache. The realtime connection is per identity too.
 */
export function GraphQLProvider({ children }: { children: ReactNode }) {
  const { identity, bridge } = useAuth()
  const value = useMemo(() => {
    const config = getConfig()
    const ssr = ssrExchange({ isClient: !isServer })
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
