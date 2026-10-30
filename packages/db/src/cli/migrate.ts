import { fileURLToPath } from 'node:url'
import { dbConfigFromEnv } from '../client'
import { runMigrations } from '../migrate'

const migrationsFolder = fileURLToPath(new URL('../../migrations', import.meta.url))

await runMigrations(dbConfigFromEnv(), migrationsFolder)
console.log('✔ migrations applied')
