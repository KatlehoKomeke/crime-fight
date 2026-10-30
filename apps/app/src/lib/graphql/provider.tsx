import { type SSRExchange, ssrExchange } from '@urql/core'
import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { Provider } from 'urql'
import { useAuth } from '../auth'
import { getConfig, isServer } from '../config'
import { createGraphQLClient } from './client'

const SsrContext = createContext<SSRExchange | null>(null)

export function useSsr(): SSRExchange {
  const ssr = useContext(SsrContext)
  if (!ssr) throw new Error('useSsr must be used inside <GraphQLProvider>')
  return ssr
}

/**
 * One urql client per signed-in identity: signing in/out swaps the client, so
 * viewer-specific fields (liked, saved, following) can never leak between
 * sessions from the cache.
 */
export function GraphQLProvider({ children }: { children: ReactNode }) {
  const { identity, bridge } = useAuth()
  const value = useMemo(() => {
    const config = getConfig()
    const ssr = ssrExchange({ isClient: !isServer })
    const client = createGraphQLClient({ url: config.apiUrl, ssr, auth: bridge, offline: isServer, persisted: config.persistedQueries })
    return { ssr, client }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity])

  return (
    <SsrContext.Provider value={value.ssr}>
      <Provider value={value.client}>{children}</Provider>
    </SsrContext.Provider>
  )
}
