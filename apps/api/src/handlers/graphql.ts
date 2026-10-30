import { createDb, dbConfigFromEnv } from '@civic/db'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context as LambdaContext } from 'aws-lambda'
import { readEnv } from '../env'
import { createApi } from '../yoga'

// Created once per container and reused across invocations.
const api = createApi({ db: createDb(dbConfigFromEnv()).db, env: readEnv() })

/** API Gateway HTTP API (payload v2) → Fetch API → Yoga. */
export async function handler(event: APIGatewayProxyEventV2, context: LambdaContext): Promise<APIGatewayProxyStructuredResultV2> {
  const query = event.rawQueryString ? `?${event.rawQueryString}` : ''
  const headers = new Headers()
  for (const [key, value] of Object.entries(event.headers ?? {})) if (value !== undefined) headers.set(key, value)
  if (event.cookies?.length) headers.set('cookie', event.cookies.join('; '))

  const method = event.requestContext.http.method
  const body = event.body && method !== 'GET' && method !== 'HEAD' ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body) : undefined

  const response = await api.fetch(`https://${event.requestContext.domainName}${event.rawPath}${query}`, { method, headers, body }, { event, context })

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  }
}
