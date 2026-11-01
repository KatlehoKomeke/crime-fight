import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { createDb, dbConfigFromEnv } from '@civic/db'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context as LambdaContext } from 'aws-lambda'
import { readEnv } from '../env'
import { appSyncPublisher } from '../realtime/publisher'
import { createApi } from '../yoga'

// Created once per container and reused across invocations.
const env = readEnv()
const realtime = env.realtimeHost ? appSyncPublisher({ host: env.realtimeHost, region: process.env.AWS_REGION ?? 'af-south-1' }) : undefined
const api = createApi({ db: createDb(dbConfigFromEnv()).db, env, realtime })

/**
 * CloudFront passes the API straight through without caching or compressing it,
 * so larger responses are compressed here. API Gateway returns base64 bodies as binary.
 */
function encode(body: string, acceptEncoding = ''): { body: string; encoding?: 'br' | 'gzip' } {
  if (Buffer.byteLength(body) < 1024) return { body }
  if (/\bbr\b/.test(acceptEncoding)) {
    return { body: brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).toString('base64'), encoding: 'br' }
  }
  if (/\bgzip\b/.test(acceptEncoding)) return { body: gzipSync(body).toString('base64'), encoding: 'gzip' }
  return { body }
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

  const encoded = encode(await response.text(), headers.get('accept-encoding') ?? undefined)
  const responseHeaders = Object.fromEntries(response.headers)
  delete responseHeaders['content-length']
  return {
    statusCode: response.status,
    headers: {
      ...responseHeaders,
      'cache-control': 'no-store',
      vary: 'accept-encoding',
      ...(encoded.encoding ? { 'content-encoding': encoded.encoding } : {}),
    },
    body: encoded.body,
    isBase64Encoded: encoded.encoding !== undefined,
  }
}
