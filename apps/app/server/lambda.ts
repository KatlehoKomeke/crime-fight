/**
 * SSR entry point for AWS Lambda (Function URL, RESPONSE_STREAM mode, behind
 * CloudFront). Wraps Expo's framework-agnostic request handler and streams
 * the HTML as React renders it.
 *
 * Bundled to CommonJS by scripts/package-lambda.mjs; `dist/server` from
 * `expo export` is copied next to it.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import type { LambdaFunctionURLEvent } from 'aws-lambda'
import { createRequestHandler } from 'expo-server/adapter/abstract'
import { createNodeEnv, createNodeRequestScope } from 'expo-server/vendor/environment/node'

interface ResponseStream extends NodeJS.WritableStream {
  end(): this
}
declare const awslambda: {
  streamifyResponse: (handler: (event: LambdaFunctionURLEvent, stream: ResponseStream) => Promise<void>) => unknown
  HttpResponseStream: {
    from: (stream: ResponseStream, metadata: { statusCode: number; headers: Record<string, string>; cookies?: string[] }) => ResponseStream
  }
}

const params = { build: path.join(__dirname, 'server'), environment: 'production' }
const scope = createNodeRequestScope(new AsyncLocalStorage(), params)
const handle = createRequestHandler(createNodeEnv(params))

/**
 * Values that only exist after CloudFront/Cognito are created (site URL, web
 * client id) are published to SSM by CDK and loaded once per cold start.
 */
const ready = (async () => {
  const name = process.env.CIVIC_PUBLIC_CONFIG_PARAM
  if (!name) return
  const { Parameter } = await new SSMClient({}).send(new GetParameterCommand({ Name: name }))
  const config = JSON.parse(Parameter?.Value ?? '{}') as Record<string, string>
  for (const [key, value] of Object.entries(config)) process.env[key] ??= value
})()

function toRequest(event: LambdaFunctionURLEvent): Request {
  const host = event.headers['x-forwarded-host'] ?? event.headers.host ?? event.requestContext.domainName
  const url = `https://${host}${event.rawPath}${event.rawQueryString ? `?${event.rawQueryString}` : ''}`
  const headers = new Headers()
  for (const [key, value] of Object.entries(event.headers)) if (value !== undefined) headers.set(key, value)
  if (event.cookies?.length) headers.set('cookie', event.cookies.join('; '))
  const method = event.requestContext.http.method
  const body = event.body && method !== 'GET' && method !== 'HEAD' ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : undefined
  return new Request(url, { method, headers, body })
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  await ready
  const response = await scope(handle, toRequest(event))
  const headers = Object.fromEntries(response.headers)
  // Anonymous HTML is cacheable at the edge for a few seconds; it never contains viewer data.
  if (headers['content-type']?.includes('text/html') && !headers['cache-control']) {
    headers['cache-control'] = 'public, max-age=0, s-maxage=10, stale-while-revalidate=60'
  }
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: response.status,
    headers,
    cookies: response.headers.getSetCookie(),
  })
  if (response.body) await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), stream)
  else stream.end()
})
