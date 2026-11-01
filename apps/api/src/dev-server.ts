import { createServer } from 'node:http'
import { createDb, dbConfigFromEnv } from '@civic/db'
import { createAuthenticator } from './auth'
import { readEnv } from './env'
import { attachLocalRealtime } from './realtime/local-server'
import { memoryHub } from './realtime/publisher'
import { createApi } from './yoga'

const port = Number(process.env.PORT ?? 4000)
const env = readEnv()
const { db } = createDb(dbConfigFromEnv())
// Inbox events go to an in-process hub, served to the app like AppSync Events would.
const hub = memoryHub()
const server = createServer(createApi({ db, env, realtime: hub }))
attachLocalRealtime(server, { hub, db, authenticate: createAuthenticator(env) })

server.listen(port, () => {
  console.log(`▲ CIVIC/ONE API on http://localhost:${port}/graphql (auth: ${env.authMode}), realtime on ws://localhost:${port}/event/realtime`)
})
