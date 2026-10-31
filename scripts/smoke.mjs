// Post-deploy smoke test: the SSR page renders and a *persisted* GraphQL
// operation round-trips through CloudFront → API → Aurora (Data API).
// Usage: node scripts/smoke.mjs https://example.cloudfront.net
import { readFileSync } from 'node:fs'

const site = process.argv[2]?.replace(/\/$/, '')
if (!site) throw new Error('usage: node scripts/smoke.mjs <site-url>')

const retry = async (name, fn, attempts = 6) => {
  for (let i = 1; ; i++) {
    try {
      await fn()
      console.log(`✔ ${name}`)
      return
    } catch (error) {
      if (i >= attempts) throw new Error(`${name}: ${error.message}`, { cause: error })
      console.log(`… ${name} (attempt ${i}) ${error.message}`)
      // First requests can hit a cold Lambda or a resuming Aurora cluster (~15s).
      await new Promise((r) => setTimeout(r, 5000 * i))
    }
  }
}

let html = ''
await retry('home page is server-rendered', async () => {
  const res = await fetch(`${site}/`)
  html = await res.text()
  if (res.status !== 200) throw new Error(`status ${res.status}`)
  if (!html.includes('<title>CIVIC/ONE')) throw new Error('missing SSR <title>')
  if (!html.includes('__CIVIC_CONFIG__')) throw new Error('missing runtime config')
})

await retry('static assets are served from S3', async () => {
  const res = await fetch(`${site}/robots.txt`)
  if (res.status !== 200) throw new Error(`status ${res.status}`)
})

// Without its hashed bundles the page renders but never hydrates.
const scripts = [...html.matchAll(/src="(\/_expo\/static\/js\/[^"]+\.js)"/g)].map((m) => m[1])
if (scripts.length === 0) throw new Error('home page references no /_expo/static scripts')
await retry('hashed JS bundles are served', async () => {
  for (const src of scripts) {
    const res = await fetch(`${site}${src}`)
    const type = res.headers.get('content-type') ?? ''
    if (res.status !== 200 || !type.includes('javascript')) throw new Error(`${src}: status ${res.status} (${type})`)
  }
})

const documents = JSON.parse(readFileSync(new URL('../packages/graphql/src/gql/persisted-documents.json', import.meta.url), 'utf8'))
const persisted = async (operationName) => {
  // Fragments are printed before the operation, so match the operation anywhere.
  const [hash] = Object.entries(documents).find(([, doc]) => new RegExp(`\\bquery ${operationName}\\b`).test(doc)) ?? []
  if (!hash) throw new Error(`${operationName} operation not found in persisted documents`)
  const res = await fetch(`${site}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationName, variables: {}, extensions: { persistedQuery: { version: 1, sha256Hash: hash } } }),
  })
  const body = await res.json()
  if (body.errors?.length || !body.data) throw new Error(`unexpected response ${res.status} ${JSON.stringify(body).slice(0, 300)}`)
  return body.data
}

await retry('persisted GraphQL operation works end to end', async () => {
  const data = await persisted('Trends')
  if (!Array.isArray(data.trends)) throw new Error('trends missing')
})

// Reads users and compares an enum-like column through the Data API, which
// types parameters and results differently from local Postgres.
await retry('app shell query (trends + trusted sources) works', async () => {
  const data = await persisted('Shell')
  if (!Array.isArray(data.trustedSources)) throw new Error('trustedSources missing')
})

console.log(`\nSmoke test passed for ${site}`)
