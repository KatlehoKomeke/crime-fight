import { fileURLToPath } from 'node:url'
import { createDb, type DbHandle } from '@civic/db'
import { runMigrations } from '@civic/db/migrate'
import { seed } from '@civic/db/seed'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readEnv } from '../src/env'
import { createApi } from '../src/yoga'

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://civic:civic@localhost:54329/civic_test'

let handle: DbHandle
let api: ReturnType<typeof createApi>
let queries = 0

interface GqlResult<T> {
  status: number
  data: T
  errors?: Array<{ message: string; extensions: Record<string, unknown> }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gql<T = any>(query: string, variables: Record<string, unknown> = {}, user?: string): Promise<GqlResult<T>> {
  const response = await api.fetch('http://test/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(user ? { 'x-dev-user': user } : {}) },
    body: JSON.stringify({ query, variables }),
  })
  return { status: response.status, ...((await response.json()) as Omit<GqlResult<T>, 'status'>) }
}

const FEED = /* GraphQL */ `
  query Feed($kind: FeedKind, $first: Int, $after: String, $near: GeoInput, $radiusKm: Float) {
    feed(kind: $kind, first: $first, after: $after, near: $near, radiusKm: $radiusKm) {
      edges {
        node {
          id
          body
          kind
          location { lat lng }
          author { handle verified }
          trustBadge
          media { url alt }
          topics { slug }
          viewerHasLiked
          likeCount
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

beforeAll(async () => {
  const url = new URL(TEST_URL)
  const database = url.pathname.slice(1)
  const admin = new pg.Client({ connectionString: Object.assign(new URL(TEST_URL), { pathname: '/postgres' }).toString() })
  await admin.connect()
  const exists = await admin.query('select 1 from pg_database where datname = $1', [database])
  if (exists.rowCount === 0) await admin.query(`create database "${database}"`)
  await admin.end()

  await runMigrations({ kind: 'postgres', url: TEST_URL }, fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)))
  handle = createDb({ kind: 'postgres', url: TEST_URL, logger: { logQuery: () => void queries++ } })
  api = createApi({ db: handle.db, env: readEnv({ STAGE: 'test', AUTH_MODE: 'dev' }) })
})

beforeEach(async () => {
  await seed(handle.db)
  queries = 0
})

afterAll(async () => {
  await handle?.close()
})

describe('feed', () => {
  it('pages newest-first without gaps or repeats', async () => {
    const first = await gql(FEED, { first: 10 })
    const second = await gql(FEED, { first: 10, after: first.data.feed.pageInfo.endCursor })
    const ids = [...first.data.feed.edges, ...second.data.feed.edges].map((e: { node: { id: string } }) => e.node.id)
    expect(new Set(ids).size).toBe(20)
    expect(first.data.feed.edges[0].node.body).toMatch(/Transit service has resumed/)
    expect(first.data.feed.pageInfo.hasNextPage).toBe(true)
  })

  it('derives trust badges from verified roles', async () => {
    const { data } = await gql(FEED, { first: 3 })
    const [transit, safewalk, fraud] = data.feed.edges.map((e: { node: unknown }) => e.node)
    expect(transit.trustBadge).toBe('VERIFIED_UPDATE')
    expect(safewalk.trustBadge).toBe('LOCAL_REPORTER')
    expect(safewalk.media[0].alt).toMatch(/city street at night/)
    expect(fraud.trustBadge).toBe('OFFICIAL_SOURCE')
  })

  it('filters NEARBY by distance with PostGIS', async () => {
    const harbor = { lat: -33.9036, lng: 18.4208 }
    const { data } = await gql(FEED, { kind: 'NEARBY', near: harbor, radiusKm: 0.5, first: 50 })
    const bodies = data.feed.edges.map((e: { node: { body: string } }) => e.node.body)
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.every((b: string) => /Harbor|harbor|residents meeting|Late bus/.test(b))).toBe(true)
  })

  it('requires sign-in for FOLLOWING and scopes it to followed accounts', async () => {
    const anon = await gql(FEED, { kind: 'FOLLOWING' })
    expect(anon.errors?.[0]?.extensions.code).toBe('UNAUTHENTICATED')

    const { data } = await gql(FEED, { kind: 'FOLLOWING', first: 50 }, 'alexm')
    const authors = new Set(data.feed.edges.map((e: { node: { author: { handle: string } } }) => e.node.author.handle))
    expect([...authors].sort()).toEqual(['alexm', 'civicone', 'metro_updates', 'victimsupport'])
  })

  it('resolves nested fields in a constant number of queries (no N+1)', async () => {
    const { data } = await gql(FEED, { first: 20 }, 'alexm')
    expect(data.feed.edges).toHaveLength(20)
    // viewer + page + authors + media + topics + likes, regardless of page size.
    expect(queries).toBeLessThanOrEqual(6)
  })

  it('rejects backward pagination instead of ignoring it', async () => {
    const { errors } = await gql(`{ feed(last: 5) { edges { cursor } } }`)
    expect(errors?.[0]?.extensions.code).toBe('BAD_USER_INPUT')
  })
})

describe('alerts, trends and sources', () => {
  it('returns only official alerts and advisories, including citywide ones', async () => {
    const { data } = await gql(`query { alerts(near: { lat: -33.9249, lng: 18.4241 }, radiusKm: 5) { edges { node { kind area } } } }`)
    const nodes = data.alerts.edges.map((e: { node: { kind: string; area: string } }) => e.node)
    expect(nodes.every((n: { kind: string }) => n.kind !== 'UPDATE')).toBe(true)
    expect(nodes.map((n: { area: string }) => n.area)).toContain('Citywide')
  })

  it('ranks trends by volume and hides already-followed sources', async () => {
    const trends = await gql(`{ trends(first: 3) { postCount topic { slug title } } }`)
    const counts = trends.data.trends.map((t: { postCount: number }) => t.postCount)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))

    const sources = await gql(`{ trustedSources(first: 10) { handle } }`, {}, 'alexm')
    const handles = sources.data.trustedSources.map((u: { handle: string }) => u.handle)
    expect(handles).not.toContain('civicone')
    expect(handles).toContain('metrodesk')
  })
})

describe('mutations', () => {
  const firstPostId = async () => (await gql(FEED, { first: 1 })).data.feed.edges[0].node.id as string

  it('requires authentication', async () => {
    const { errors } = await gql(`mutation($id: ID!) { likePost(id: $id) { id } }`, { id: await firstPostId() })
    expect(errors?.[0]?.extensions.code).toBe('UNAUTHENTICATED')
  })

  it('likes idempotently and keeps the counter in step', async () => {
    const id = await firstPostId()
    const like = `mutation($id: ID!) { likePost(id: $id) { likeCount viewerHasLiked } }`
    const unlike = `mutation($id: ID!) { unlikePost(id: $id) { likeCount viewerHasLiked } }`

    const once = await gql(like, { id }, 'alexm')
    const twice = await gql(like, { id }, 'alexm')
    expect(once.data.likePost).toEqual({ likeCount: 187, viewerHasLiked: true })
    expect(twice.data.likePost).toEqual({ likeCount: 187, viewerHasLiked: true })

    const undone = await gql(unlike, { id }, 'alexm')
    expect(undone.data.unlikePost).toEqual({ likeCount: 186, viewerHasLiked: false })
  })

  it('blocks posts that expose personal information', async () => {
    const { errors } = await gql(
      `mutation($input: CreatePostInput!) { createPost(input: $input) { id } }`,
      { input: { body: 'The suspect is 8001015009087, lives nearby' } },
      'alexm',
    )
    expect(errors?.[0]?.extensions.code).toBe('BAD_USER_INPUT')
    expect(errors?.[0]?.extensions.privacy).toEqual([expect.objectContaining({ kind: 'NATIONAL_ID', level: 'block' })])
  })

  it('only lets verified officials publish alerts', async () => {
    const input = { body: 'Road closed on Main', kind: 'ALERT', severity: 'WARNING' }
    const member = await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) { id } }`, { input }, 'alexm')
    expect(member.errors?.[0]?.extensions.code).toBe('FORBIDDEN')

    const official = await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) { kind severity trustBadge } }`, { input }, 'cityalerts')
    expect(official.data.createPost).toEqual({ kind: 'ALERT', severity: 'WARNING', trustBadge: 'OFFICIAL_SOURCE' })
  })

  it('threads replies, links topics and coarsens member locations', async () => {
    const parentId = await firstPostId()
    const { data } = await gql(
      `mutation($input: CreatePostInput!) {
        createPost(input: $input) { body location { lat lng } topics { slug title } replyTo { id replyCount } }
      }`,
      { input: { body: 'Platform 2 is clear now #CentralStation #NightTrain', replyToId: parentId, location: { lat: -33.92213, lng: 18.42317 } } },
      'thandi_m',
    )
    expect(data.createPost.location).toEqual({ lat: -33.92, lng: 18.42 })
    expect(data.createPost.topics.map((t: { slug: string }) => t.slug).sort()).toEqual(['centralstation', 'nighttrain'])
    expect(data.createPost.topics.find((t: { slug: string }) => t.slug === 'nighttrain').title).toBe('NightTrain')
    expect(data.createPost.replyTo).toEqual({ id: parentId, replyCount: 27 })
  })
})
