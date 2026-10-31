import { type AnyVariables, type SSRData, ssrExchange, type TypedDocumentNode } from '@urql/core'
import { ShellQuery } from '@/graphql/documents'
import { serverApiUrl, serverConfig } from '../config'
import { createGraphQLClient } from './client'

export type Prefetch = <Data, Variables extends AnyVariables>(document: TypedDocumentNode<Data, Variables>, variables: Variables) => Promise<Data | undefined>

export interface PrefetchedData {
  urql: SSRData
}

interface SharedResponse {
  status: number
  headers: Array<[string, string]>
  body: string
}

const SHARE_MS = 5_000
const recent = new Map<string, { expires: number; response: Promise<SharedResponse> }>()

const hasErrors = (body: string) => {
  try {
    return Boolean((JSON.parse(body) as { errors?: unknown[] }).errors?.length)
  } catch {
    return true
  }
}

/**
 * Shares identical API calls made by this server within a few seconds. A
 * page's loader and its generateMetadata ask for the same query, and renders
 * running at the same time on this Lambda can share one round trip. Prefetch
 * never sends credentials, so every response here is anonymous and safe to
 * share. Failures are not kept.
 */
const sharedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const key = `${init?.method ?? 'GET'} ${url} ${typeof init?.body === 'string' ? init.body : ''}`
  const now = Date.now()
  for (const [k, entry] of recent) if (entry.expires < now) recent.delete(k)

  let entry = recent.get(key)
  if (!entry) {
    const response = fetch(input, init).then(async (res) => ({ status: res.status, headers: [...res.headers], body: await res.text() }))
    entry = { expires: now + SHARE_MS, response }
    recent.set(key, entry)
    const forget = () => void recent.delete(key)
    response.then((res) => {
      if (res.status !== 200 || hasErrors(res.body)) forget()
    }, forget)
  }
  const { status, headers, body } = await entry.response
  return new Response(body, { status, headers })
}

/**
 * Runs GraphQL operations inside a route `loader` (server only) and returns
 * them in urql's SSR format. The page renders with real content in the HTML —
 * crawlers and link previews see posts, not spinners — and the client hydrates
 * from the same payload without refetching.
 *
 * Every page that prefetches sits in the app shell, so the right rail
 * (trends, trusted sources) is fetched alongside: it arrives in the first HTML
 * instead of as a request after hydration.
 */
export async function prefetch(run: (fetch: Prefetch) => Promise<unknown>): Promise<PrefetchedData> {
  const ssr = ssrExchange({ isClient: false })
  const client = createGraphQLClient({
    url: serverApiUrl(),
    ssr,
    persisted: serverConfig().persistedQueries,
    fetch: sharedFetch,
  })
  const query: Prefetch = async (document, variables) => (await client.query(document, variables).toPromise()).data
  try {
    await Promise.all([run(query), query(ShellQuery, {})])
  } catch (error) {
    // A slow or failing API must not take the page down; the client will retry.
    console.error('[prefetch] failed', error)
  }
  return { urql: ssr.extractData() }
}
