import { createDb, dbConfigFromEnv } from '@civic/db'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context as LambdaContext } from 'aws-lambda'
import { readEnv } from '../env'
import { createApi } from '../yoga'

// Created once per container and reused across invocations.
const api = createApi({ db: createDb(dbConfigFromEnv()).db, env: readEnv() })

/**
 * Signed-out reads (persisted queries arrive as GET) return the same data to
 * everyone, so CloudFront may share them for about a minute: 30s fresh plus
 * 30s served stale while it refreshes. Anything signed in, failed or
 * partially failed is never cached.
 */
const EDGE_CACHE = 'public, max-age=0, s-maxage=30, stale-while-revalidate=30'

function cacheControl(method: string, headers: Headers, status: number, body: string): string {
  if (method !== 'GET' || headers.has('authorization') || status !== 200) return 'no-store'
  try {
    return (JSON.parse(body) as { errors?: unknown[] }).errors?.length ? 'no-store' : EDGE_CACHE
  } catch {
    return 'no-store'
  }
}

/** API Gateway HTTP API (payload v2) → Fetch API → Yoga. */
export async function handler(event: APIGatewayProxyEventV2, context: LambdaContext): Promise<APIGatewayProxyStructuredResultV2> {
  const query = event.rawQueryString ? `?${event.rawQueryString}` : ''
  const headers = new Headers()
  for (const [key, value] of Object.entries(event.headers ?? {})) if (value !== undefined) headers.set(key, value)
  if (event.cookies?.length) headers.set('cookie', event.cookies.join('; '))

  const method = event.requestContext.http.method
  const body = event.body && method !== 'GET' && method !== 'HEAD' ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body) : undefined

  const response = await api.fetch(`https://${event.requestContext.domainName}${event.rawPath}${query}`, { method, headers, body }, { event, context })

  const text = await response.text()
  return {
    statusCode: response.status,
    headers: { ...Object.fromEntries(response.headers), 'cache-control': cacheControl(method, headers, response.status, text) },
    body: text,
  }
}
