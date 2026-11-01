import { Client, type Exchange, type ExecutionResult, fetchExchange, type SSRExchange, subscriptionExchange } from '@urql/core'
import { authExchange } from '@urql/exchange-auth'
import { cacheExchange } from '@urql/exchange-graphcache'
import { persistedExchange } from '@urql/exchange-persisted'
import type { RealtimeClient } from '../realtime'
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
  /** Delivers subscriptions; the operation's `context.channel` names the channel. */
  realtime?: RealtimeClient | null
}

const hashOf = (document: unknown): Promise<string> => {
  const hash = (document as { __meta__?: { hash?: string } }).__meta__?.hash
  return hash ? Promise.resolve(hash) : Promise.reject(new Error('Document has no persisted hash — run `pnpm codegen`'))
}

export function createGraphQLClient({ url, ssr, auth, offline, persisted, fetchHeaders, fetch, realtime }: Options): Client {
  const exchanges: Exchange[] = [cacheExchange(cacheConfig), ssr]

  if (!offline) {
    if (realtime) {
      // Subscriptions never reach /graphql: the API publishes each result to the
      // subscriber's own channel, and it flows back through the cache from here.
      exchanges.push(
        subscriptionExchange({
          forwardSubscription: (_request, operation) => ({
            subscribe: (sink) => {
              const channel = operation.context.channel as string | undefined
              const unsubscribe = channel ? realtime.subscribe(channel, (event) => sink.next(event as ExecutionResult)) : () => undefined
              return { unsubscribe }
            },
          }),
        }),
      )
    }
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
