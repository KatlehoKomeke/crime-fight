import path from 'node:path'
import { dbConfigFromEnv } from '@civic/db'
import { runMigrations } from '@civic/db/migrate'

/**
 * Invoked by a CDK Trigger on every deploy, before the new API version goes
 * live. Drizzle records applied migrations, so re-runs are no-ops.
 */
export async function handler(): Promise<{ ok: true }> {
  await runMigrations(dbConfigFromEnv(), path.join(import.meta.dirname, 'migrations'))
  return { ok: true }
}
