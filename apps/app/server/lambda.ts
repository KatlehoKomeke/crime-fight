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
import { constants, createBrotliCompress, createGzip } from 'node:zlib'
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

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml)|image\/svg\+xml)/

/**
 * CloudFront passes pages straight through, so it never compresses them (it also
 * can't compress a streamed body). The function does it instead. Each chunk is
 * flushed so streamed HTML still reaches the browser as React renders it. Brotli
 * quality 5 is fast enough to run per request and still beats gzip on size.
 */
function compressor(acceptEncoding = '') {
  if (/\bbr\b/.test(acceptEncoding)) {
    return { encoding: 'br', stream: createBrotliCompress({ flush: constants.BROTLI_OPERATION_FLUSH, params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }) }
  }
  if (/\bgzip\b/.test(acceptEncoding)) return { encoding: 'gzip', stream: createGzip({ flush: constants.Z_SYNC_FLUSH }) }
  return undefined
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  await ready
  const response = await scope(handle, toRequest(event))
  const headers = Object.fromEntries(response.headers)
  const compressible = COMPRESSIBLE.test(headers['content-type'] ?? '')
  const compress = response.body && compressible ? compressor(event.headers['accept-encoding']) : undefined
  if (compressible) headers.vary = headers.vary ? `${headers.vary}, accept-encoding` : 'accept-encoding'
  if (compress) {
    headers['content-encoding'] = compress.encoding
    delete headers['content-length']
  }
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: response.status,
    headers,
    cookies: response.headers.getSetCookie(),
  })
  if (!response.body) {
    stream.end()
    return
  }
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  if (compress) await pipeline(body, compress.stream, stream)
  else await pipeline(body, stream)
})
