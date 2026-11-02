import { createDb, dbConfigFromEnv } from '@civic/db'
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { serveOg } from '../og/serve'

// Created once per container and reused across invocations.
const { db } = createDb(dbConfigFromEnv())

/** API Gateway HTTP API (payload v2) → link preview card. Bodies go back base64, which API Gateway returns as binary. */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  const query = event.rawQueryString ? `?${event.rawQueryString}` : ''
  const response = await serveOg(db, new URL(`https://${event.requestContext.domainName}${event.rawPath}${query}`))
  const body = event.requestContext.http.method === 'HEAD' ? '' : Buffer.from(await response.arrayBuffer()).toString('base64')
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body, isBase64Encoded: true }
}
