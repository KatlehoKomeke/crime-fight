import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createDb, dbConfigFromEnv } from '@civic/db'
import { createAuthenticator } from './auth'
import { readEnv } from './env'
import { serveOg } from './og/serve'
import { attachLocalRealtime } from './realtime/local-server'
import { memoryHub } from './realtime/publisher'
import { createApi } from './yoga'

const port = Number(process.env.PORT ?? 4000)
const env = readEnv()
const { db } = createDb(dbConfigFromEnv())
// Inbox events go to an in-process hub, served to the app like AppSync Events would.
const hub = memoryHub()
const api = createApi({ db, env, realtime: hub })

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

const server = createServer((req, res) => (req.url?.startsWith('/og/') ? void og(req, res) : api(req, res)))
attachLocalRealtime(server, { hub, db, authenticate: createAuthenticator(env) })

server.listen(port, () => {
  console.log(`▲ CIVIC/ONE API on http://localhost:${port}/graphql (auth: ${env.authMode}), realtime on ws://localhost:${port}/event/realtime, cards on /og`)
})
