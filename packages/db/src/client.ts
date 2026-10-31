import { RDSDataClient } from '@aws-sdk/client-rds-data'
import type { Logger } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzleDataApi } from 'drizzle-orm/aws-data-api/pg'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export type DbConfig =
  | { kind: 'postgres'; url: string; maxConnections?: number; logger?: Logger }
  | { kind: 'data-api'; resourceArn: string; secretArn: string; database: string; logger?: Logger }

/** Both drivers expose the same query builder; callers never need to know which one is live. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

export interface DbHandle {
  db: Database
  close: () => Promise<void>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Aurora Serverless v2 clusters that scaled to zero answer the first call with
 * DatabaseResumingException while they wake (~15s). Retry those transparently.
 */
export function createDataApiClient(): RDSDataClient {
  const client = new RDSDataClient({})
  client.middlewareStack.add(
    (next) => async (args) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await next(args)
        } catch (error) {
          if ((error as Error).name !== 'DatabaseResumingException' || attempt >= 10) throw error
          await sleep(Math.min(500 * 2 ** attempt, 5000))
        }
      }
    },
    { step: 'initialize', name: 'retryDatabaseResuming' },
  )
  return client
}

export function createDb(config: DbConfig): DbHandle {
  if (config.kind === 'data-api') {
    const client = createDataApiClient()
    const db = drizzleDataApi(client, {
      schema,
      casing: 'snake_case',
      resourceArn: config.resourceArn,
      secretArn: config.secretArn,
      database: config.database,
      logger: config.logger,
    })
    return {
      db: db as unknown as Database,
      close: () => {
        client.destroy()
        return Promise.resolve()
      },
    }
  }

  const pool = new pg.Pool({ connectionString: config.url, max: config.maxConnections ?? 10 })
  const db = drizzleNodePg(pool, { schema, casing: 'snake_case', logger: config.logger })
  return { db: db as unknown as Database, close: () => pool.end() }
}

/** Reads DATABASE_URL (local/CI) or the Data API trio set by CDK on Lambda. */
export function dbConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  if (env.DB_CLUSTER_ARN && env.DB_SECRET_ARN) {
    return {
      kind: 'data-api',
      resourceArn: env.DB_CLUSTER_ARN,
      secretArn: env.DB_SECRET_ARN,
      database: env.DB_NAME ?? 'civic',
    }
  }
  return { kind: 'postgres', url: env.DATABASE_URL ?? 'postgres://civic:civic@localhost:54329/civic' }
}
