import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { createDb, dbConfigFromEnv } from '@civic/db'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context as LambdaContext } from 'aws-lambda'
import { sweep } from '../data/bounties'
import { readEnv } from '../env'
import { resolvePayments } from '../payments'
import { handleWebhook } from '../payments/webhook'
import { appSyncPublisher } from '../realtime/publisher'
import { cognitoSignIns } from '../sign-ins'
import { createApi } from '../yoga'

// Created once per container and reused across invocations.
const env = readEnv()
const realtime = env.realtimeHost ? appSyncPublisher({ host: env.realtimeHost, region: process.env.AWS_REGION ?? 'af-south-1' }) : undefined
const signIns = env.authMode === 'cognito' && env.cognitoUserPoolId ? cognitoSignIns(env.cognitoUserPoolId) : undefined
const { db } = createDb(dbConfigFromEnv())
// The Paystack key and the site URL come from Secrets Manager / SSM, once per cold start.
const ready = resolvePayments(env).then((payments) => ({ payments, api: createApi({ db, env, realtime, signIns, payments }) }))

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

const WEBHOOK = /^\/payments\/([a-z]+)\/webhook$/

/** API Gateway HTTP API (payload v2) → Fetch API → Yoga. Also the payment webhook, and the hourly bounty sweep from EventBridge. */
export async function handler(event: APIGatewayProxyEventV2 | { source?: string }, context: LambdaContext): Promise<APIGatewayProxyStructuredResultV2> {
  const { payments, api } = await ready

  if (!('requestContext' in event)) {
    const report = await sweep({ db, payments })
    console.log('[bounties] sweep', report)
    return { statusCode: 200, body: JSON.stringify(report) }
  }

  const webhook = WEBHOOK.exec(event.rawPath)
  if (webhook) {
    if (event.requestContext.http.method !== 'POST') return { statusCode: 405, body: 'Method not allowed' }
    // The signature covers the raw bytes, so the body is verified exactly as it arrived.
    const raw = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8')
    const result = await handleWebhook({ db, payments }, webhook[1]!, raw, event.headers['x-paystack-signature'])
    return { statusCode: result.status, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' }, body: result.body }
  }

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
