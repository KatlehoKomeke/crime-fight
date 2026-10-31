import { Client, type Exchange, fetchExchange, type SSRExchange } from '@urql/core'
import { authExchange } from '@urql/exchange-auth'
import { cacheExchange } from '@urql/exchange-graphcache'
import { persistedExchange } from '@urql/exchange-persisted'
import { cacheConfig } from './cache'

export interface AuthBridge {
  headers: () => Record<string, string>
  isExpiringSoon: () => boolean
  refresh: () => Promise<void>
}

interface Options {
  url: string
  ssr: SSRExchange
  auth?: AuthBridge
  /** Server render pass: never hit the network, only render what loaders prefetched. */
  offline?: boolean
  persisted?: boolean
  fetchHeaders?: Record<string, string>
  fetch?: typeof fetch
}

const hashOf = (document: unknown): Promise<string> => {
  const hash = (document as { __meta__?: { hash?: string } }).__meta__?.hash
  return hash ? Promise.resolve(hash) : Promise.reject(new Error('Document has no persisted hash — run `pnpm codegen`'))
}

export function createGraphQLClient({ url, ssr, auth, offline, persisted, fetchHeaders, fetch }: Options): Client {
  const exchanges: Exchange[] = [cacheExchange(cacheConfig), ssr]

  if (!offline) {
    if (auth) {
      exchanges.push(
        authExchange(async (utils) => ({
          addAuthToOperation: (operation) => utils.appendHeaders(operation, auth.headers()),
          didAuthError: (error) => error.response?.status === 401,
          willAuthError: () => auth.isExpiringSoon(),
          refreshAuth: auth.refresh,
        })),
      )
    }
    // Send a sha256 hash instead of the query text; prod rejects anything else.
    if (persisted) exchanges.push(persistedExchange({ enforcePersistedQueries: true, enableForMutation: true, generateHash: (_query, document) => hashOf(document) }))
    exchanges.push(fetchExchange)
  }

  return new Client({
    url,
    exchanges,
    fetchOptions: fetchHeaders ? { headers: fetchHeaders } : undefined,
    fetch,
  })
}
