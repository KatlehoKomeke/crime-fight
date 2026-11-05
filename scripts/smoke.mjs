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
  // CloudFront passes pages through untouched, so the SSR Lambda must compress them.
  if (!/^(br|gzip)$/.test(res.headers.get('content-encoding') ?? '')) throw new Error('page is not compressed')
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

// The head declares the web fonts. A missing file is easy to miss: it just looks like the fallback font.
const fonts = [...new Set([...html.matchAll(/url\("(\/assets\/[^"]+\.woff2)"\)/g)].map((m) => m[1]))]
if (fonts.length === 0) throw new Error('home page declares no WOFF2 fonts')
await retry('web fonts are served', async () => {
  for (const src of fonts) {
    const res = await fetch(`${site}${src}`)
    if (res.status !== 200) throw new Error(`${src}: status ${res.status}`)
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

// The payment webhook route must reach the API: an unsigned body is refused by the API itself (401), or
// 404 while no provider is configured. Anything else means CloudFront or the HTTP API isn't wired. A stage
// with a Paystack secret (EXPECT_PAYMENTS=1) must answer 401: a 404 there means the secret couldn't be read.
await retry('payment webhook route reaches the API', async () => {
  const res = await fetch(`${site}/payments/paystack/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  if (process.env.EXPECT_PAYMENTS === '1' && res.status !== 401) throw new Error(`status ${res.status}; the API runs without its payment provider`)
  if (res.status !== 401 && res.status !== 404) throw new Error(`status ${res.status}`)
})
