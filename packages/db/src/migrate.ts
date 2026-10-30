import { drizzle as drizzleDataApi } from 'drizzle-orm/aws-data-api/pg'
import { migrate as migrateDataApi } from 'drizzle-orm/aws-data-api/pg/migrator'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { createDataApiClient, type DbConfig } from './client'

/** Applies pending SQL migrations. Used by the local CLI and the deploy-time migration Lambda. */
export async function runMigrations(config: DbConfig, migrationsFolder: string): Promise<void> {
  if (config.kind === 'data-api') {
    const client = createDataApiClient()
    try {
      const db = drizzleDataApi(client, {
        resourceArn: config.resourceArn,
        secretArn: config.secretArn,
        database: config.database,
      })
      await migrateDataApi(db, { migrationsFolder })
    } finally {
      client.destroy()
    }
    return
  }

  const pool = new pg.Pool({ connectionString: config.url, max: 1 })
  try {
    await migrateNodePg(drizzleNodePg(pool), { migrationsFolder })
  } finally {
    await pool.end()
  }
}
