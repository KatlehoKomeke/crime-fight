import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createDb, dbConfigFromEnv } from '@civic/db'
import { createAuthenticator } from './auth'
import { readEnv } from './env'
import { serveOg } from './og/serve'
import { resolvePayments } from './payments'
import { handleWebhook } from './payments/webhook'
import { attachLocalRealtime } from './realtime/local-server'
import { memoryHub } from './realtime/publisher'
import { createApi } from './yoga'

const port = Number(process.env.PORT ?? 4000)
const env = readEnv()
const { db } = createDb(dbConfigFromEnv())
// Inbox events go to an in-process hub, served to the app like AppSync Events would.
const hub = memoryHub()
const payments = await resolvePayments(env)
const api = createApi({ db, env, realtime: hub, payments })

/** Link preview cards. Deployed, CloudFront sends /og/* to their own function. */
async function og(req: IncomingMessage, res: ServerResponse) {
  try {
    const response = await serveOg(db, new URL(req.url!, `http://${req.headers.host}`))
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error('[og]', error)
    res.writeHead(500).end()
  }
}

/** Payment provider webhooks, verified on the raw body exactly as the Lambda does. */
function webhook(req: IncomingMessage, res: ServerResponse, provider: string) {
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  req.on('end', () => {
    void handleWebhook({ db, payments }, provider, Buffer.concat(chunks), req.headers['x-paystack-signature'] as string | undefined).then((result) => {
      res.writeHead(result.status, { 'content-type': 'text/plain' })
      res.end(result.body)
    })
  })
}

const server = createServer((req, res) => {
  const hook = /^\/payments\/([a-z]+)\/webhook$/.exec(req.url ?? '')
  if (hook && req.method === 'POST') return webhook(req, res, hook[1]!)
  if (req.url?.startsWith('/og/')) return void og(req, res)
  return api(req, res)
})
attachLocalRealtime(server, { hub, db, authenticate: createAuthenticator(env) })

server.listen(port, () => {
  console.log(
    `▲ CIVIC/ONE API on http://localhost:${port}/graphql (auth: ${env.authMode}, payments: ${payments.provider?.name ?? 'disabled'}), realtime on ws://localhost:${port}/event/realtime, cards on /og`,
  )
})
