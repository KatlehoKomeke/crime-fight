import { createDb, dbConfigFromEnv } from '../client'
import { seed } from '../seed'

const config = dbConfigFromEnv()
if (config.kind === 'data-api' && process.env.SEED_ALLOW_REMOTE !== '1') {
  console.error('Refusing to seed a remote database. Set SEED_ALLOW_REMOTE=1 to seed QA on purpose.')
  process.exit(1)
}

const { db, close } = createDb(config)
const result = await seed(db)
console.log(`✔ seeded ${result.users} users, ${result.posts} posts, ${result.topics} topics`)
await close()
