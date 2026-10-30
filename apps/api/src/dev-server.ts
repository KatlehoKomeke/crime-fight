import { createServer } from 'node:http'
import { createDb, dbConfigFromEnv } from '@civic/db'
import { readEnv } from './env'
import { createApi } from './yoga'

const port = Number(process.env.PORT ?? 4000)
const { db } = createDb(dbConfigFromEnv())
const api = createApi({ db, env: readEnv() })

createServer(api).listen(port, () => {
  console.log(`▲ CIVIC/ONE API on http://localhost:${port}/graphql (auth: ${readEnv().authMode})`)
})
