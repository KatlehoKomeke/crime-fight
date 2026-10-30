import { type AnyVariables, type SSRData, ssrExchange, type TypedDocumentNode } from '@urql/core'
import { serverApiUrl, serverConfig } from '../config'
import { createGraphQLClient } from './client'

export type Prefetch = <Data, Variables extends AnyVariables>(document: TypedDocumentNode<Data, Variables>, variables: Variables) => Promise<Data | undefined>

export interface PrefetchedData {
  urql: SSRData
}

/**
 * Runs GraphQL operations inside a route `loader` (server only) and returns
 * them in urql's SSR format. The page renders with real content in the HTML —
 * crawlers and link previews see posts, not spinners — and the client hydrates
 * from the same payload without refetching.
 */
export async function prefetch(run: (fetch: Prefetch) => Promise<unknown>): Promise<PrefetchedData> {
  const ssr = ssrExchange({ isClient: false })
  const client = createGraphQLClient({
    url: serverApiUrl(),
    ssr,
    persisted: serverConfig().persistedQueries,
  })
  try {
    await run(async (document, variables) => (await client.query(document, variables).toPromise()).data)
  } catch (error) {
    // A slow or failing API must not take the page down; the client will retry.
    console.error('[prefetch] failed', error)
  }
  return { urql: ssr.extractData() }
}
