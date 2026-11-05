import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { createDataApiClient, createDb, type DbConfig, type DbHandle, schema } from '@civic/db'
import { runMigrations } from '@civic/db/migrate'
import { seed } from '@civic/db/seed'
import { eq } from 'drizzle-orm'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthenticator, type Identity } from '../src/auth'
import { deleteAccount } from '../src/data/account'
import { resolveViewer } from '../src/data/users'
import { readEnv } from '../src/env'
import { serveOg } from '../src/og/serve'
import { attachLocalRealtime } from '../src/realtime/local-server'
import { memoryHub } from '../src/realtime/publisher'
import type { SignIns } from '../src/sign-ins'
import { handleProviderEvent } from '../src/data/bounties'
import { paystackProvider } from '../src/payments/paystack'
import { sandboxProvider } from '../src/payments/sandbox'
import { createApi } from '../src/yoga'

const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://civic:civic@localhost:54329/civic_test'
/**
 * Set both to run the suite through the RDS Data API (the driver Lambda uses)
 * against a `civic_test` database on a real Aurora cluster. The Data API types
 * parameters and results differently from node-postgres, so this catches
 * queries that only fail once deployed.
 */
const DATA_API = process.env.TEST_DATA_API_CLUSTER_ARN && process.env.TEST_DATA_API_SECRET_ARN
  ? {
      resourceArn: process.env.TEST_DATA_API_CLUSTER_ARN,
      secretArn: process.env.TEST_DATA_API_SECRET_ARN,
      // Override to keep concurrent runs (e.g. two branches) from reseeding each other's data.
      database: process.env.TEST_DATA_API_DATABASE ?? 'civic_test',
    }
  : undefined
// Every query is an HTTPS round trip there; seeding alone takes seconds.
if (DATA_API) vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

let handle: DbHandle
let api: ReturnType<typeof createApi>
let queries = 0
/** Inbox events the API publishes, as AppSync Events would deliver them. */
const hub = memoryHub()
/** Pretend money: checkouts complete on request, transfers settle at once, an account ending 0000 bounces. */
const payments = { provider: sandboxProvider({ siteUrl: 'http://test' }), siteUrl: 'http://test', fingerprintKey: 'test', claimMinAccountAgeHours: 72 }

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
  query Feed($kind: FeedKind, $first: Int, $after: String) {
    feed(kind: $kind, first: $first, after: $after) {
      edges {
        node {
          id
          body
          kind
          author { handle verified }
          trustBadge
          media { url alt }
          topics { slug }
          viewerHasLiked
          likeCount
          bounty { id }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

async function ensureDatabase(): Promise<DbConfig> {
  if (DATA_API) {
    const client = createDataApiClient()
    const run = (sql: string) => client.send(new ExecuteStatementCommand({ resourceArn: DATA_API.resourceArn, secretArn: DATA_API.secretArn, database: 'postgres', sql }))
    const exists = await run(`select 1 from pg_database where datname = '${DATA_API.database}'`)
    if (!exists.records?.length) await run(`create database "${DATA_API.database}"`)
    client.destroy()
    return { kind: 'data-api', ...DATA_API }
  }
  const url = new URL(TEST_URL)
  const database = url.pathname.slice(1)
  const admin = new pg.Client({ connectionString: Object.assign(new URL(TEST_URL), { pathname: '/postgres' }).toString() })
  await admin.connect()
  const exists = await admin.query('select 1 from pg_database where datname = $1', [database])
  if (exists.rowCount === 0) await admin.query(`create database "${database}"`)
  await admin.end()
  return { kind: 'postgres', url: TEST_URL }
}

beforeAll(async () => {
  const config = await ensureDatabase()
  await runMigrations(config, fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)))
  handle = createDb({ ...config, logger: { logQuery: () => void queries++ } })
  api = createApi({ db: handle.db, env: readEnv({ STAGE: 'test', AUTH_MODE: 'dev', ADMIN_HANDLES: 'civicone' }), realtime: hub, payments })
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
    // viewer + page + authors + media + topics + likes + bounties, regardless of page size.
    expect(queries).toBeLessThanOrEqual(7)
  })

  it('rejects backward pagination instead of ignoring it', async () => {
    const { errors } = await gql(`{ feed(last: 5) { edges { cursor } } }`)
    expect(errors?.[0]?.extensions.code).toBe('BAD_USER_INPUT')
  })
})

describe('notifications', () => {
  const NOTIFICATIONS = /* GraphQL */ `
    query Notifications($first: Int, $after: String) {
      notifications(first: $first, after: $after) {
        edges { node { id kind actor { handle } post { kind area body } } }
        pageInfo { hasNextPage endCursor }
      }
    }
  `
  type Node = { id: string; kind: string; actor: { handle: string }; post: { kind: string; area: string; body: string } | null }
  const nodesOf = (result: GqlResult<{ notifications: { edges: Array<{ node: Node }> } }>) => result.data.notifications.edges.map((e) => e.node)

  it('shows anonymous visitors official alerts and advisories only, from every area', async () => {
    const nodes = nodesOf(await gql(NOTIFICATIONS, { first: 50 }))
    expect(nodes.length).toBeGreaterThan(0)
    expect(nodes.every((n) => n.kind === 'ALERT' && n.post?.kind !== 'UPDATE')).toBe(true)
    expect(nodes.map((n) => n.post?.area)).toContain('Citywide')
  })

  it('adds replies, likes, reposts and follows from other people, newest first', async () => {
    const create = `mutation($input: CreatePostInput!) { createPost(input: $input) { id author { id } } }`
    const mine = (await gql(create, { input: { body: 'Streetlight out on Albert Road' } }, 'alexm')).data.createPost
    await gql(`mutation($id: ID!) { likePost(id: $id) { id } }`, { id: mine.id }, 'jordan_o')
    await gql(`mutation($id: ID!) { repostPost(id: $id) { id } }`, { id: mine.id }, 'thandi_m')
    await gql(create, { input: { body: 'Logged it with the City too', replyToId: mine.id } }, 'thandi_m')
    await gql(`mutation($id: ID!) { followUser(id: $id) { id } }`, { id: mine.author.id }, 'jordan_o')
    // Your own actions never notify you.
    await gql(`mutation($id: ID!) { likePost(id: $id) { id } }`, { id: mine.id }, 'alexm')
    await gql(create, { input: { body: 'Update: fixed', replyToId: mine.id } }, 'alexm')

    const nodes = nodesOf(await gql(NOTIFICATIONS, { first: 50 }, 'alexm'))
    expect(nodes.slice(0, 4).map((n) => [n.kind, n.actor.handle, n.post?.body ?? null])).toEqual([
      ['FOLLOW', 'jordan_o', null],
      ['REPLY', 'thandi_m', 'Logged it with the City too'],
      ['REPOST', 'thandi_m', 'Streetlight out on Albert Road'],
      ['LIKE', 'jordan_o', 'Streetlight out on Albert Road'],
    ])
    expect(nodes.slice(4).every((n) => n.kind === 'ALERT')).toBe(true)
    expect(nodes.filter((n) => n.actor.handle === 'alexm')).toEqual([])
  })

  it('pages through alerts and activity together without gaps or repeats', async () => {
    // jordan_o has a seeded reply from harbor_watch and three bounty events (claim confirmed, verified, paid) to merge with the four seeded alerts.
    const all = nodesOf(await gql(NOTIFICATIONS, { first: 50 }, 'jordan_o')).map((n) => n.id)
    expect(all).toHaveLength(8)
    const ids: string[] = []
    let after: string | null = null
    do {
      const page: GqlResult<{ notifications: { edges: Array<{ node: Node }>; pageInfo: { hasNextPage: boolean; endCursor: string } } }> = await gql(
        NOTIFICATIONS,
        { first: 2, after },
        'jordan_o',
      )
      ids.push(...nodesOf(page).map((n) => n.id))
      after = page.data.notifications.pageInfo.hasNextPage ? page.data.notifications.pageInfo.endCursor : null
    } while (after)
    expect(ids).toEqual(all)
  })

  it('reports when the newest one happened, for an unread marker', async () => {
    const LATEST = /* GraphQL */ `
      query { latestNotificationAt notifications(first: 1) { edges { node { createdAt } } } }
    `
    const newest = (result: GqlResult<{ latestNotificationAt: string | null; notifications: { edges: Array<{ node: { createdAt: string } }> } }>) => {
      expect(result.data.latestNotificationAt).toBe(result.data.notifications.edges[0]?.node.createdAt ?? null)
      return result.data.latestNotificationAt!
    }
    const anonymous = newest(await gql(LATEST))
    const before = newest(await gql(LATEST, {}, 'jordan_o'))

    const { data } = await gql(`{ user(handle: "jordan_o") { posts(first: 1) { edges { node { id } } } } }`)
    const reply = { body: 'Seen this too', replyToId: data.user.posts.edges[0].node.id }
    await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) { id } }`, { input: reply }, 'alexm')

    expect(Date.parse(newest(await gql(LATEST, {}, 'jordan_o')))).toBeGreaterThan(Date.parse(before))
    // Activity is private: signed out, only new alerts move it.
    expect(newest(await gql(LATEST))).toBe(anonymous)
  })
})

describe('trends and sources', () => {
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

describe('follow lists', () => {
  const LISTS = `query($handle: String!, $first: Int, $after: String) {
    user(handle: $handle) {
      followers(first: $first, after: $after) { edges { node { handle } } pageInfo { hasNextPage endCursor } }
      following(first: $first, after: $after) { edges { node { handle } } pageInfo { hasNextPage endCursor } }
    }
  }`
  const handles = (connection: { edges: Array<{ node: { handle: string } }> }) => connection.edges.map((e) => e.node.handle)
  const userId = async (h: string) => (await handle.db.select().from(schema.users).where(eq(schema.users.handle, h)))[0]!.id

  it('lists who follows an account and whom it follows, to anyone, without gaps or repeats', async () => {
    const support = await userId('victimsupport')
    const soon = (minutes: number) => new Date(Date.now() + minutes * 60_000)
    await handle.db.insert(schema.follows).values([
      { followerId: await userId('jordan_o'), followeeId: support, createdAt: soon(1) },
      { followerId: await userId('thandi_m'), followeeId: support, createdAt: soon(2) },
    ])

    const first = await gql(LISTS, { handle: 'victimsupport', first: 2 })
    expect(handles(first.data.user.followers)).toEqual(['thandi_m', 'jordan_o'])
    expect(first.data.user.followers.pageInfo.hasNextPage).toBe(true)

    const rest = await gql(LISTS, { handle: 'victimsupport', first: 2, after: first.data.user.followers.pageInfo.endCursor })
    expect(handles(rest.data.user.followers).sort()).toEqual(['alexm', 'civicone'])
    expect(rest.data.user.followers.pageInfo.hasNextPage).toBe(false)

    const alex = await gql(LISTS, { handle: 'alexm', first: 10 })
    expect(handles(alex.data.user.following).sort()).toEqual(['civicone', 'metro_updates', 'victimsupport'])
    expect(handles(alex.data.user.followers)).toEqual([])
  })
})

describe('link preview cards', () => {
  const og = (path: string) => serveOg(handle.db, new URL(path, 'http://test'))
  const CARDS = `{
    user(handle: "victimsupport") { previewImage { path alt } }
    topic(slug: "safewalk") { previewImage { path alt } }
    feed(first: 1) { edges { node { previewImage { path alt } } } }
  }`

  beforeEach(() => {
    // Post photos and avatars are fetched from their hosts; tests stay offline and draw without them.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    return () => vi.restoreAllMocks()
  })

  it('draws 1200×630 PNGs of profiles, posts, topics and pages, cached for good at their current version', async () => {
    const { data } = await gql(CARDS)
    const paths = [data.user.previewImage.path, data.topic.previewImage.path, data.feed.edges[0].node.previewImage.path, '/og/page/home.png']
    for (const path of paths) {
      const res = await og(path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      const png = new DataView(await res.arrayBuffer())
      expect(png.getUint32(0)).toBe(0x89504e47)
      expect([png.getUint32(16), png.getUint32(20)]).toEqual([1200, 630])
    }
    expect((await og(paths[0])).headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(data.user.previewImage.alt).toMatch(/^Victim Support \(@victimsupport\) on CIVIC\/ONE, support service: \d+ posts?, \d+ following, \d+ followers?\.$/)
    expect(data.topic.previewImage.alt).toMatch(/^#Westside safe-walk on CIVIC\/ONE: \d+ posts in community\.$/)
  })

  it('gives a card a new version when what it shows changes, and redirects old ones', async () => {
    const before = (await gql(CARDS)).data.user.previewImage.path as string
    expect((await og(before.replace(/\?.*/, ''))).headers.get('location')).toBe(before)

    await handle.db.update(schema.users).set({ displayName: 'Victim Support Network' }).where(eq(schema.users.handle, 'victimsupport'))
    const after = (await gql(CARDS)).data.user.previewImage.path as string
    expect(after).not.toBe(before)
    const stale = await og(before)
    expect(stale.status).toBe(302)
    expect(stale.headers.get('location')).toBe(after)
    expect(stale.headers.get('cache-control')).toBe('public, max-age=300')
  })

  it('only draws stored records, never text from the URL', async () => {
    for (const path of ['/og/profile/nobody_here.png', '/og/post/not-a-post.png', '/og/topic/nothing.png', '/og/page/admin.png', '/og/alert/x.png', '/og/profile/%E0%A4%A.png']) {
      expect((await og(path)).status, path).toBe(404)
    }
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

  it('publishes posts with personal information: the composer warns, the author decides', async () => {
    const { data, errors } = await gql(
      `mutation($input: CreatePostInput!) { createPost(input: $input) { body } }`,
      { input: { body: 'The suspect is 8001015009087, lives nearby' } },
      'alexm',
    )
    expect(errors).toBeUndefined()
    expect(data.createPost.body).toMatch(/8001015009087/)
  })

  it('only lets verified officials publish alerts', async () => {
    const input = { body: 'Road closed on Main', kind: 'ALERT', severity: 'WARNING' }
    const member = await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) { id } }`, { input }, 'alexm')
    expect(member.errors?.[0]?.extensions.code).toBe('FORBIDDEN')

    const official = await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) { kind severity trustBadge } }`, { input }, 'cityalerts')
    expect(official.data.createPost).toEqual({ kind: 'ALERT', severity: 'WARNING', trustBadge: 'OFFICIAL_SOURCE' })
  })

  it('threads replies and links topics', async () => {
    const parentId = await firstPostId()
    const { data } = await gql(
      `mutation($input: CreatePostInput!) {
        createPost(input: $input) { body topics { slug title } replyTo { id replyCount } }
      }`,
      { input: { body: 'Platform 2 is clear now #CentralStation #NightTrain', replyToId: parentId } },
      'thandi_m',
    )
    expect(data.createPost.topics.map((t: { slug: string }) => t.slug).sort()).toEqual(['centralstation', 'nighttrain'])
    expect(data.createPost.topics.find((t: { slug: string }) => t.slug === 'nighttrain').title).toBe('NightTrain')
    expect(data.createPost.replyTo).toEqual({ id: parentId, replyCount: 27 })
  })
})

describe('sign-in provisioning', () => {
  const google = { kind: 'cognito', sub: 'c0ffee00-0000-4000-8000-000000000001', email: 'Jane.Doe@gmail.com', name: 'Jane Doe' } as const
  const usersWithSub = (sub: string) => handle.db.select().from(schema.users).where(eq(schema.users.authSub, sub))

  it('creates one user per Cognito account on first sign-in and links it by sub', async () => {
    const first = await resolveViewer(handle.db, google)
    expect(first).toMatchObject({ authSub: google.sub, handle: 'janedoe', displayName: 'Jane Doe', email: 'Jane.Doe@gmail.com', role: 'MEMBER' })
    const again = await resolveViewer(handle.db, google)
    expect(again?.id).toBe(first?.id)
    expect(await usersWithSub(google.sub)).toHaveLength(1)
  })

  it('keeps the email in step with the provider without overwriting an edited name', async () => {
    const created = await resolveViewer(handle.db, google)
    await handle.db.update(schema.users).set({ displayName: 'JD' }).where(eq(schema.users.id, created!.id))
    const after = await resolveViewer(handle.db, { ...google, email: 'jane@example.org', name: 'Jane Q. Doe' })
    expect(after).toMatchObject({ id: created!.id, email: 'jane@example.org', displayName: 'JD' })
  })

  it('gives a second account with the same email name a distinct handle', async () => {
    const taken = await resolveViewer(handle.db, { kind: 'cognito', sub: 'c0ffee00-0000-4000-8000-000000000002', email: 'alexm@icloud.com' })
    expect(taken?.handle).toMatch(/^alexm\d{4}$/)
  })

  it('shows an account’s email to its owner only', async () => {
    await handle.db.update(schema.users).set({ email: 'alex@example.org' }).where(eq(schema.users.handle, 'alexm'))
    const query = 'query { user(handle: "alexm") { email } }'
    expect((await gql(query, {}, 'alexm')).data.user.email).toBe('alex@example.org')
    expect((await gql(query, {}, 'jordan_o')).data.user.email).toBeNull()
    expect((await gql(query)).data.user.email).toBeNull()
  })

  it('finds users and topics regardless of case', async () => {
    const { data } = await gql('query { user(handle: "@AlexM") { handle } topic(slug: "#SafeWalk") { slug } }')
    expect(data).toEqual({ user: { handle: 'alexm' }, topic: { slug: 'safewalk' } })
  })
})

describe('messaging', () => {
  const START = `mutation($userId: ID!) { startConversation(userId: $userId) { id } }`
  const SEND = `mutation($id: ID!, $body: String!) {
    sendMessage(conversationId: $id, body: $body) {
      conversation { id unreadCount lastMessage { body } }
      messageEdge { node { body isMine sender { handle } } }
      viewer { handle unreadConversationCount }
    }
  }`
  const INBOX = `query($first: Int!, $after: String) {
    conversations(first: $first, after: $after) { edges { node { id lastMessage { body } } } pageInfo { hasNextPage endCursor } }
  }`

  const idOf = async (who: string) => (await gql(`query($handle: String!) { user(handle: $handle) { id } }`, { handle: who })).data.user.id as string
  const follow = (id: string, as: string) => gql(`mutation($id: ID!) { followUser(id: $id) { id } }`, { id }, as)
  const channelOf = async (who: string) => (await gql(`{ viewer { inboxChannel } }`, {}, who)).data.viewer.inboxChannel as string
  /** Collects what the API publishes to a channel. */
  function listen(channel: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: Array<{ data: { inbox: Record<string, any> } }> = []
    const stop = hub.subscribe(channel, (event) => events.push(event as (typeof events)[number]))
    return { events, stop }
  }

  /** alexm and thandi_m follow each other and open a conversation. */
  async function mutuals() {
    const [alex, thandi] = await Promise.all([idOf('alexm'), idOf('thandi_m')])
    await follow(thandi, 'alexm')
    await follow(alex, 'thandi_m')
    return { alex, thandi, conversationId: (await gql(START, { userId: thandi }, 'alexm')).data.startConversation.id as string }
  }

  it('only lets people who follow each other start a conversation', async () => {
    const [alex, support] = await Promise.all([idOf('alexm'), idOf('victimsupport')])
    const canMessage = async () => (await gql(`{ user(handle: "victimsupport") { viewerCanMessage } }`, {}, 'alexm')).data.user.viewerCanMessage
    // alexm follows victimsupport, who doesn't follow back yet.
    expect(await canMessage()).toBe(false)
    expect((await gql(START, { userId: support }, 'alexm')).errors?.[0]?.extensions.code).toBe('FORBIDDEN')

    await follow(alex, 'victimsupport')
    expect(await canMessage()).toBe(true)
    const opened = (await gql(START, { userId: support }, 'alexm')).data.startConversation.id
    expect((await gql(START, { userId: alex }, 'victimsupport')).data.startConversation.id).toBe(opened)
    // Opened but empty: not in the inbox until someone writes.
    expect((await gql(INBOX, { first: 5 }, 'alexm')).data.conversations.edges).toEqual([])
  })

  it('sends each member their own copy of a new message in real time', async () => {
    const { conversationId } = await mutuals()
    const alexInbox = listen(await channelOf('alexm'))
    const thandiInbox = listen(await channelOf('thandi_m'))
    try {
      const body = 'Saw the outage notice. Is the 07:10 still running?'
      const { data } = await gql(SEND, { id: conversationId, body: `  ${body}  ` }, 'alexm')
      expect(data.sendMessage).toEqual({
        conversation: { id: conversationId, unreadCount: 0, lastMessage: { body } },
        messageEdge: { node: { body, isMine: true, sender: { handle: 'alexm' } } },
        viewer: { handle: 'alexm', unreadConversationCount: 0 },
      })

      // Each copy is the app's Inbox subscription, resolved as that member.
      expect(alexInbox.events).toHaveLength(1)
      expect(alexInbox.events[0]!.data.inbox).toMatchObject({ messageEdge: { node: { isMine: true } }, conversation: { members: [{ handle: 'thandi_m' }] } })
      expect(thandiInbox.events).toHaveLength(1)
      expect(thandiInbox.events[0]!.data.inbox).toMatchObject({
        conversation: { id: conversationId, unreadCount: 1, members: [{ handle: 'alexm' }] },
        messageEdge: { node: { body, isMine: false, sender: { handle: 'alexm' } } },
        viewer: { unreadConversationCount: 1 },
      })
    } finally {
      alexInbox.stop()
      thandiInbox.stop()
    }
  })

  it('marks a conversation read and tells your other devices', async () => {
    const { conversationId } = await mutuals()
    await gql(SEND, { id: conversationId, body: 'Thanks for the heads-up' }, 'alexm')
    const thandiInbox = listen(await channelOf('thandi_m'))
    try {
      const { data } = await gql(
        `mutation($id: ID!) { markConversationRead(id: $id) { conversation { unreadCount } messageEdge { cursor } viewer { unreadConversationCount } } }`,
        { id: conversationId },
        'thandi_m',
      )
      expect(data.markConversationRead).toEqual({ conversation: { unreadCount: 0 }, messageEdge: null, viewer: { unreadConversationCount: 0 } })
      expect(thandiInbox.events.map((event) => event.data.inbox.viewer.unreadConversationCount)).toEqual([0])
    } finally {
      thandiInbox.stop()
    }
  })

  it('orders the inbox by latest activity and pages messages newest first', async () => {
    const { alex, conversationId } = await mutuals()
    await follow(alex, 'victimsupport')
    const other = (await gql(START, { userId: await idOf('victimsupport') }, 'alexm')).data.startConversation.id
    for (const body of ['one', 'two', 'three']) await gql(SEND, { id: conversationId, body }, 'alexm')
    await gql(SEND, { id: other, body: 'latest' }, 'victimsupport')

    const first = await gql(INBOX, { first: 1 }, 'alexm')
    const second = await gql(INBOX, { first: 1, after: first.data.conversations.pageInfo.endCursor }, 'alexm')
    expect([first, second].map((page) => page.data.conversations.edges[0].node.lastMessage.body)).toEqual(['latest', 'three'])
    expect(second.data.conversations.pageInfo.hasNextPage).toBe(false)

    const THREAD = `query($id: ID!, $after: String) { conversation(id: $id) { messages(first: 2, after: $after) { edges { node { body } } pageInfo { endCursor } } } }`
    const recent = (await gql(THREAD, { id: conversationId }, 'thandi_m')).data.conversation.messages
    const older = (await gql(THREAD, { id: conversationId, after: recent.pageInfo.endCursor }, 'thandi_m')).data.conversation.messages
    expect([...recent.edges, ...older.edges].map((edge: { node: { body: string } }) => edge.node.body)).toEqual(['three', 'two', 'one'])
  })

  it('stops new messages once either person unfollows, keeping the history', async () => {
    const { alex, conversationId } = await mutuals()
    await gql(SEND, { id: conversationId, body: 'See you at the meeting' }, 'alexm')
    await gql(`mutation($id: ID!) { unfollowUser(id: $id) { id } }`, { id: alex }, 'thandi_m')

    expect((await gql(SEND, { id: conversationId, body: 'One more thing' }, 'alexm')).errors?.[0]?.extensions.code).toBe('FORBIDDEN')
    expect((await gql(SEND, { id: conversationId, body: 'Bye' }, 'thandi_m')).errors?.[0]?.extensions.code).toBe('FORBIDDEN')
    const { data } = await gql(
      `query($id: ID!) { conversation(id: $id) { viewerCanSend messages(first: 5) { edges { node { body } } } } }`,
      { id: conversationId },
      'alexm',
    )
    expect(data.conversation).toEqual({ viewerCanSend: false, messages: { edges: [{ node: { body: 'See you at the meeting' } }] } })
  })

  it('keeps conversations, channels and counts private to their members', async () => {
    const { conversationId } = await mutuals()
    await gql(SEND, { id: conversationId, body: 'Just between us' }, 'alexm')

    expect((await gql(`query($id: ID!) { conversation(id: $id) { id } }`, { id: conversationId }, 'jordan_o')).data.conversation).toBeNull()
    expect((await gql(SEND, { id: conversationId, body: 'Hi' }, 'jordan_o')).errors?.[0]?.extensions.code).toBe('NOT_FOUND')
    expect((await gql(INBOX, { first: 5 })).errors?.[0]?.extensions.code).toBe('UNAUTHENTICATED')
    expect((await gql(`{ user(handle: "alexm") { inboxChannel unreadConversationCount } }`, {}, 'jordan_o')).data.user).toEqual({
      inboxChannel: null,
      unreadConversationCount: null,
    })
  })

  it('rejects empty messages and lists mutual follows as contacts', async () => {
    const { conversationId } = await mutuals()
    expect((await gql(SEND, { id: conversationId, body: '   ' }, 'alexm')).errors?.[0]?.extensions.code).toBe('BAD_USER_INPUT')

    // Seeded: the newsroom and the support service follow each other.
    const contacts = async (query?: string) =>
      (await gql(`query($query: String) { messageContacts(query: $query) { handle } }`, { query }, 'victimsupport')).data.messageContacts.map(
        (user: { handle: string }) => user.handle,
      )
    expect(await contacts()).toEqual(['civicone'])
    expect(await contacts('Newsroom')).toEqual(['civicone'])
    expect(await contacts('metro')).toEqual([])
  })

  it('serves your own inbox, and only yours, over the AppSync Events protocol locally', async () => {
    const server = createServer()
    const wss = attachLocalRealtime(server, { hub, db: handle.db, authenticate: createAuthenticator(readEnv({ STAGE: 'test', AUTH_MODE: 'dev' })) })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const auth = { host: 'localhost', 'x-dev-user': 'alexm' }
    const socket = new WebSocket(`ws://localhost:${(server.address() as AddressInfo).port}/event/realtime`, [
      'aws-appsync-event-ws',
      `header-${Buffer.from(JSON.stringify(auth)).toString('base64url')}`,
    ])
    const next = () =>
      new Promise<Record<string, unknown>>((resolve) => socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), { once: true }))
    try {
      await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))
      socket.send(JSON.stringify({ type: 'connection_init' }))
      expect(await next()).toMatchObject({ type: 'connection_ack' })

      socket.send(JSON.stringify({ type: 'subscribe', id: 'theirs', channel: await channelOf('jordan_o'), authorization: auth }))
      expect(await next()).toMatchObject({ type: 'subscribe_error', id: 'theirs' })

      const mine = await channelOf('alexm')
      socket.send(JSON.stringify({ type: 'subscribe', id: 'mine', channel: mine, authorization: auth }))
      expect(await next()).toEqual({ type: 'subscribe_success', id: 'mine' })

      const delivered = next()
      await hub.publish(mine, [{ data: { ping: true } }])
      const event = await delivered
      expect(event).toMatchObject({ type: 'data', id: 'mine' })
      expect(JSON.parse(event.event as string)).toEqual({ data: { ping: true } })
    } finally {
      socket.close()
      wss.close()
      server.close()
    }
  })
})

describe('account deletion', () => {
  const DELETE = `mutation($handle: String!) { deleteAccount(handle: $handle) }`
  const COUNTS = `query($id: ID!) { post(id: $id) { likeCount repostCount replyCount } }`
  const idOf = async (who: string) => (await gql(`query($handle: String!) { user(handle: $handle) { id } }`, { handle: who })).data.user?.id as string | undefined
  const post = async (as: string, body: string, replyToId?: string) =>
    (await gql(`mutation($input: CreatePostInput!) { createPost(input: $input) { id } }`, { input: { body, replyToId } }, as)).data.createPost.id as string
  const postExists = async (id: string) => (await gql(`query($id: ID!) { post(id: $id) { id } }`, { id })).data.post !== null
  const act = (mutation: string, id: string, as: string) => gql(`mutation($id: ID!) { ${mutation}(id: $id) { id } }`, { id }, as)

  it('deletes everything the account owns and gives back its counts on other people’s posts', async () => {
    const theirs = await post('jordan_o', 'Streetlights out on Main Road again tonight')
    const before = (await gql(COUNTS, { id: theirs })).data.post
    const mine = await post('alexm', 'Brown and white dog found near the park, very friendly')
    const answer = await post('jordan_o', 'Looks like the one missing from Oak Street', mine)
    await post('alexm', 'Reported it to the municipality as well', theirs)
    await act('likePost', theirs, 'alexm')
    await act('repostPost', theirs, 'alexm')

    const [alex, jordan] = [(await idOf('alexm'))!, (await idOf('jordan_o'))!]
    await act('followUser', jordan, 'alexm')
    await act('followUser', alex, 'jordan_o')
    const conversation = (await gql(`mutation($userId: ID!) { startConversation(userId: $userId) { id } }`, { userId: jordan }, 'alexm')).data.startConversation.id
    const send = (body: string, as: string) => gql(`mutation($id: ID!, $body: String!) { sendMessage(conversationId: $id, body: $body) { conversation { id } } }`, { id: conversation, body }, as)
    await send('Is that your dog?', 'jordan_o')
    await send('It is, thank you!', 'alexm')

    expect(await gql(DELETE, { handle: ' @AlexM ' }, 'alexm')).toMatchObject({ data: { deleteAccount: true } })

    expect(await idOf('alexm')).toBeUndefined()
    expect((await gql(COUNTS, { id: theirs })).data.post).toEqual(before)
    // The account's posts go, and the replies under them with them.
    expect([await postExists(mine), await postExists(answer), await postExists(theirs)]).toEqual([false, false, true])
    const inbox = (await gql(`{ conversations(first: 20) { edges { node { id } } } }`, {}, 'jordan_o')).data.conversations.edges
    expect(inbox.map((edge: { node: { id: string } }) => edge.node.id)).not.toContain(conversation)

    const { likes, saves, reposts, follows, messages, conversationMembers } = schema
    const left = await Promise.all([
      handle.db.select().from(likes).where(eq(likes.userId, alex)),
      handle.db.select().from(saves).where(eq(saves.userId, alex)),
      handle.db.select().from(reposts).where(eq(reposts.userId, alex)),
      handle.db.select().from(follows).where(eq(follows.followerId, alex)),
      handle.db.select().from(follows).where(eq(follows.followeeId, alex)),
      handle.db.select().from(messages).where(eq(messages.senderId, alex)),
      handle.db.select().from(conversationMembers).where(eq(conversationMembers.userId, alex)),
    ])
    expect(left.flat()).toEqual([])
  })

  it('needs a signed-in user and their own handle', async () => {
    expect((await gql(DELETE, { handle: 'alexm' })).errors?.[0]?.extensions.code).toBe('UNAUTHENTICATED')
    expect((await gql(DELETE, { handle: 'jordan_o' }, 'alexm')).errors?.[0]?.extensions.code).toBe('BAD_USER_INPUT')
    expect(await idOf('alexm')).toBeDefined()
  })

  it('removes the sign-in, so a still-valid token can’t bring the account back', async () => {
    const removed: Identity[] = []
    const signIns: SignIns = {
      exists: (identity) => Promise.resolve(!removed.some((r) => r.kind === 'cognito' && identity.kind === 'cognito' && r.sub === identity.sub)),
      remove: (identity) => {
        removed.push(identity)
        return Promise.resolve()
      },
    }
    const withSignIns = createApi({ db: handle.db, env: readEnv({ STAGE: 'test', AUTH_MODE: 'dev' }), realtime: hub, signIns })
    await withSignIns.fetch('http://test/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-user': 'alexm' },
      body: JSON.stringify({ query: DELETE, variables: { handle: 'alexm' } }),
    })
    expect(removed).toEqual([{ kind: 'dev', handle: 'alexm' }])

    // A deleted Cognito user's ID token keeps verifying until it expires (up to an hour).
    const google = { kind: 'cognito', sub: 'c0ffee00-0000-4000-8000-000000000003', username: 'google_1003', email: 'sam@example.org', name: 'Sam' } as const
    const sam = await resolveViewer(handle.db, google, signIns)
    await deleteAccount(handle.db, sam!)
    await signIns.remove(google)
    await expect(resolveViewer(handle.db, google, signIns)).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } })
    expect(await handle.db.select().from(schema.users).where(eq(schema.users.authSub, google.sub))).toEqual([])
  })
})

describe('bounties', () => {
  const CREATE = `mutation($input: CreateBountyInput!) { createBounty(input: $input) { checkoutUrl bounty { id status } } }`
  const PAY = `mutation($id: ID!, $outcome: String) { sandboxCompleteCheckout(id: $id, outcome: $outcome) { id status fundedAt expiresAt } }`
  const BOARD = `query($honoured: Boolean) { bounties(first: 20, honoured: $honoured) { edges { node { id title status claimCount } } } }`
  const GET = `query($id: ID!) { bounty(id: $id) { id status isExpired viewerIsPoster claimCount claims { id status } viewerClaim { id status } events { kind byAdmin note } } }`
  const CONFIRM = `mutation($id: ID!, $note: String) { confirmClaim(id: $id, note: $note) { id status cooldownUntil } }`
  const DECIDE = `mutation($id: ID!, $decision: ClaimDecision!, $reason: ClaimDecisionReason!, $note: String!) { decideClaim(id: $id, decision: $decision, reason: $reason, note: $note) { id status decisionReason } }`
  const CLAIM = `mutation($bountyId: ID!, $input: SubmitClaimInput!) { submitClaim(bountyId: $bountyId, input: $input) { id status } }`
  const property = {
    kind: 'PROPERTY',
    title: 'Red Honda Fit, CA 11-22, taken from Mill Street',
    body: 'Taken from outside my flat on Mill Street on Tuesday night. Red Honda Fit with a roof rack and a dent on the bonnet. Reported at Gardens SAPS.',
    amountCents: 100000,
    durationDays: 30,
    termsAccepted: true,
  }
  const claimBody = 'I gave a statement at Gardens SAPS on Wednesday about where the car was parked; Const Naidoo added it to the case and gave me a receipt.'
  const seeded = async (prefix: string) => (await handle.db.select().from(schema.bounties)).find((b) => b.title.startsWith(prefix))!
  const titles = (result: GqlResult<{ bounties: { edges: Array<{ node: { title: string } }> } }>) => result.data.bounties.edges.map((e) => e.node.title.split(',')[0])
  const code = (result: GqlResult<unknown>) => result.errors?.[0]?.extensions.code
  /** A posted bounty, paid for, on the board. */
  const funded = async (as: string, input: Record<string, unknown> = property) => {
    const { data, errors } = await gql(CREATE, { input }, as)
    expect(errors).toBeUndefined()
    const id = data.createBounty.bounty.id as string
    await gql(PAY, { id }, as)
    return id
  }

  it('shows open bounties on the board, honoured ones on their own, and nothing unpaid or under review', async () => {
    expect(titles(await gql(BOARD)).sort()).toEqual(['Information on the Harbor Avenue camera vandalism', 'Silver 2016 Toyota Corolla'])
    expect(titles(await gql(BOARD, { honoured: true }))).toEqual(['Black Giant hybrid bicycle taken from the Gardens station rack'])
    // Under review: only its poster and admins can open it.
    const missing = await seeded('Missing:')
    expect((await gql(GET, { id: missing.id })).data.bounty).toBeNull()
    expect((await gql(GET, { id: missing.id }, 'thandi_m')).data.bounty.status).toBe('PENDING_REVIEW')
    expect((await gql(GET, { id: missing.id }, 'civicone')).data.bounty.status).toBe('PENDING_REVIEW')
  })

  it('creates a bounty, holds the money once the checkout settles, and lists it', async () => {
    const { data } = await gql(CREATE, { input: property }, 'alexm')
    expect(data.createBounty.bounty.status).toBe('PENDING_PAYMENT')
    expect(data.createBounty.checkoutUrl).toContain('sandbox=1')
    const id = data.createBounty.bounty.id
    expect(titles(await gql(BOARD))).not.toContain('Red Honda Fit')

    const paid = await gql(PAY, { id }, 'alexm')
    expect(paid.data.sandboxCompleteCheckout.status).toBe('OPEN')
    expect(paid.data.sandboxCompleteCheckout.fundedAt).not.toBeNull()
    expect(Date.parse(paid.data.sandboxCompleteCheckout.expiresAt) - Date.parse(paid.data.sandboxCompleteCheckout.fundedAt)).toBe(30 * 24 * 60 * 60_000)
    // Paying twice can't fund twice.
    expect((await gql(PAY, { id }, 'alexm')).data.sandboxCompleteCheckout.status).toBe('OPEN')
    const [bounty] = await handle.db.select().from(schema.bounties).where(eq(schema.bounties.id, id))
    expect(bounty).toMatchObject({ depositedCents: 100000, releasedCents: 0, refundedCents: 0 })
    const ledger = await handle.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.bountyId, id))
    expect(ledger.map((e) => [e.type, e.status, e.amountCents])).toEqual([['DEPOSIT', 'SETTLED', 100000]])
    expect(titles(await gql(BOARD))).toContain('Red Honda Fit')
  })

  it('refuses claims from accounts younger than the waiting period', async () => {
    // A thief can't open an account to claim their own bounty the same day. The demo accounts are ten days old.
    await handle.db.insert(schema.users).values({ handle: 'newbie', displayName: 'New Neighbour', authSub: 'dev:newbie' })
    const corolla = await seeded('Silver 2016')
    const input = { body: 'Saw it parked behind the Salt River station on Thursday and told the SAPS officer on duty there at 09:00.', attested: true }
    const result = await gql(CLAIM, { bountyId: corolla.id, input }, 'newbie')
    expect(code(result)).toBe('BAD_USER_INPUT')
    expect(result.errors?.[0]?.message).toMatch(/New accounts can submit claims after 3 days/)
    await handle.db.delete(schema.users).where(eq(schema.users.handle, 'newbie'))
  })

  it('tells the public a claim came in, but not from whom', async () => {
    const harbor = await seeded('Information on the Harbor')
    const EVENTS = `query($id: ID!) { bounty(id: $id) { events { kind actor { handle } } } }`
    const submitted = (result: { data: { bounty: { events: Array<{ kind: string; actor: { handle: string } | null }> } } }) => result.data.bounty.events.find((e) => e.kind === 'CLAIM_SUBMITTED')
    expect(submitted(await gql(EVENTS, { id: harbor.id }))?.actor).toBeNull()
    expect(submitted(await gql(EVENTS, { id: harbor.id }, 'alexm'))?.actor).toBeNull()
    expect(submitted(await gql(EVENTS, { id: harbor.id }, 'harbor_watch'))?.actor?.handle).toBe('jordan_o')
    expect(submitted(await gql(EVENTS, { id: harbor.id }, 'jordan_o'))?.actor?.handle).toBe('jordan_o')
  })

  it('refuses bounties that break the rules, with a message the form can show', async () => {
    const refused = async (input: Record<string, unknown>, message: RegExp) => {
      const result = await gql(CREATE, { input: { ...property, ...input } }, 'alexm')
      expect(code(result)).toBe('BAD_USER_INPUT')
      expect(result.errors?.[0]?.message).toMatch(message)
    }
    await refused({ title: 'Find @jordan_o, he took my car' }, /Don’t name anyone/)
    await refused({ amountCents: 5000 }, /minimum bounty/)
    await refused({ amountCents: 123456 }, /Whole rands/)
    await refused({ body: `${property.body} My ID is 8001015009087.` }, /ID and card numbers/)
    await refused({ kind: 'MISSING_PERSON', relationship: 'Sister' }, /needs the SAPS case number/)
    await refused({ kind: 'MISSING_PERSON', relationship: 'Sister', sapsCaseNumber: 'CAS 5/11/2026', durationDays: 60 }, /at most 30 days/)
    await refused({ kind: 'MISSING_PERSON', relationship: 'Sister', sapsCaseNumber: 'CAS 5/11/2026', body: 'Last seen at 14 Mill Street, Gardens, on Sunday afternoon wearing a grey hoodie and black jeans.' }, /address/)
    expect(code(await gql(CREATE, { input: property }))).toBe('UNAUTHENTICATED')
    // Three open at a time.
    for (let i = 0; i < 3; i++) await funded('alexm', { ...property, title: `${property.title} ${i}` })
    expect((await gql(CREATE, { input: property }, 'alexm')).errors?.[0]?.message).toMatch(/3 bounties open/)
  })

  it('pays the claimant once the poster confirms, the cooling-off passes and an admin verifies', async () => {
    const harbor = await seeded('Information on the Harbor')
    const { claims } = (await gql(GET, { id: harbor.id }, 'harbor_watch')).data.bounty
    expect(claims).toHaveLength(1)
    const claimId = claims[0].id as string
    // Only the poster sees claims; the claimant sees their own.
    expect((await gql(GET, { id: harbor.id }, 'thandi_m')).data.bounty).toMatchObject({ claims: [], viewerClaim: null, claimCount: 1 })
    expect((await gql(GET, { id: harbor.id }, 'jordan_o')).data.bounty.viewerClaim.id).toBe(claimId)
    expect(code(await gql(CONFIRM, { id: claimId }, 'alexm'))).toBe('NOT_FOUND')

    const confirmed = await gql(CONFIRM, { id: claimId, note: 'Sgt Dlamini confirmed the statement is on the file.' }, 'harbor_watch')
    expect(confirmed.data.confirmClaim.status).toBe('CONFIRMED')
    expect(Date.parse(confirmed.data.confirmClaim.cooldownUntil) - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60_000)
    expect((await gql(GET, { id: harbor.id })).data.bounty.status).toBe('AWAITING_VERIFICATION')
    // Nobody else can claim now, and nobody but an admin can decide.
    expect((await gql(CLAIM, { bountyId: harbor.id, input: { body: claimBody, attested: true } }, 'thandi_m')).errors?.[0]?.message).toMatch(/aren’t being accepted/)
    const decision = { id: claimId, decision: 'VERIFY', reason: 'VERIFIED', note: 'Statement confirmed with the station.' }
    expect(code(await gql(DECIDE, decision, 'harbor_watch'))).toBe('FORBIDDEN')
    const early = await gql(DECIDE, decision, 'civicone')
    expect(code(early)).toBe('BAD_USER_INPUT')
    expect(early.errors?.[0]?.message).toMatch(/cooling-off/)

    await handle.db.update(schema.bountyClaims).set({ cooldownUntil: new Date(Date.now() - 1000) }).where(eq(schema.bountyClaims.id, claimId))
    const paid = await gql(DECIDE, decision, 'civicone')
    expect(paid.errors).toBeUndefined()
    expect(paid.data.decideClaim).toMatchObject({ status: 'PAID', decisionReason: 'VERIFIED' })
    expect((await gql(GET, { id: harbor.id })).data.bounty.status).toBe('PAID')
    const [bounty] = await handle.db.select().from(schema.bounties).where(eq(schema.bounties.id, harbor.id))
    expect(bounty).toMatchObject({ depositedCents: 200000, releasedCents: 200000, refundedCents: 0, winningClaimId: claimId })
    const ledger = await handle.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.bountyId, harbor.id))
    expect(ledger.map((e) => [e.type, e.status]).sort()).toEqual([['DEPOSIT', 'SETTLED'], ['RELEASE', 'SETTLED']])
    // Deciding twice does nothing.
    expect(code(await gql(DECIDE, decision, 'civicone'))).toBe('BAD_USER_INPUT')
    // The claimant hears about it; admin actions carry no name.
    const mine = await gql(`{ notifications(first: 10) { edges { node { kind bountyEvent actor { handle } bounty { id } } } } }`, {}, 'jordan_o')
    const events = mine.data.notifications.edges.map((e: { node: { kind: string; bountyEvent: string | null; actor: { handle: string } | null } }) => e.node).filter((n: { kind: string }) => n.kind === 'BOUNTY')
    expect(events.map((n: { bountyEvent: string }) => n.bountyEvent)).toEqual(expect.arrayContaining(['CLAIM_CONFIRMED', 'CLAIM_VERIFIED', 'PAID']))
    expect(events.find((n: { bountyEvent: string }) => n.bountyEvent === 'CLAIM_VERIFIED').actor).toBeNull()
  })

  it('won’t let a poster cancel over a live claim, and lets a rejected claimant dispute', async () => {
    const harbor = await seeded('Information on the Harbor')
    const claimId = (await gql(GET, { id: harbor.id }, 'harbor_watch')).data.bounty.claims[0].id as string
    const CANCEL = `mutation($id: ID!) { cancelBounty(id: $id) { id status } }`
    expect((await gql(CANCEL, { id: harbor.id }, 'harbor_watch')).errors?.[0]?.message).toMatch(/claim is waiting/)
    const rejected = await gql(`mutation($id: ID!, $note: String!) { rejectClaim(id: $id, note: $note) { status } }`, { id: claimId, note: 'The van was mine, parked there legally.' }, 'harbor_watch')
    expect(rejected.data.rejectClaim.status).toBe('REJECTED_BY_POSTER')
    // Still refused: the claimant has a week to dispute, and the money must still be there.
    expect((await gql(CANCEL, { id: harbor.id }, 'harbor_watch')).errors?.[0]?.message).toMatch(/claim is waiting/)
    const disputed = await gql(`mutation($id: ID!, $note: String!) { disputeClaim(id: $id, note: $note) { status cooldownUntil } }`, { id: claimId, note: 'The statement receipt shows the registration; please check with the station.' }, 'jordan_o')
    expect(disputed.data.disputeClaim.status).toBe('DISPUTED')
    // Paying over the poster's head is an override, recorded as one.
    await handle.db.update(schema.bountyClaims).set({ cooldownUntil: new Date(Date.now() - 1000) }).where(eq(schema.bountyClaims.id, claimId))
    expect((await gql(DECIDE, { id: claimId, decision: 'VERIFY', reason: 'VERIFIED', note: 'Checked.' }, 'civicone')).errors?.[0]?.message).toMatch(/override/)
    const paid = await gql(DECIDE, { id: claimId, decision: 'VERIFY', reason: 'ADMIN_OVERRIDE', note: 'The station confirmed the statement led to the arrest.' }, 'civicone')
    expect(paid.data.decideClaim).toMatchObject({ status: 'PAID', decisionReason: 'ADMIN_OVERRIDE' })
  })

  it('refunds the poster when a bounty is cancelled, expired or declined', async () => {
    const corolla = await seeded('Silver 2016')
    const cancelled = await gql(`mutation($id: ID!) { cancelBounty(id: $id) { id status } }`, { id: corolla.id }, 'jordan_o')
    expect(cancelled.data.cancelBounty.status).toBe('CANCELLED')
    const [after] = await handle.db.select().from(schema.bounties).where(eq(schema.bounties.id, corolla.id))
    expect(after).toMatchObject({ depositedCents: 500000, refundedCents: 500000, releasedCents: 0 })
    expect(titles(await gql(BOARD))).not.toContain('Silver 2016 Toyota Corolla')

    // Missing-person bounties wait for an admin; declining refunds.
    const missing = await seeded('Missing:')
    expect(code(await gql(`mutation($id: ID!, $note: String!) { approveBounty(id: $id, note: $note) { status } }`, { id: missing.id, note: 'ok' }, 'thandi_m'))).toBe('FORBIDDEN')
    const declined = await gql(`mutation($id: ID!, $note: String!) { declineBounty(id: $id, note: $note) { status } }`, { id: missing.id, note: 'No case number could be confirmed with Woodstock SAPS.' }, 'civicone')
    expect(declined.data.declineBounty.status).toBe('CANCELLED')
    const [refunded] = await handle.db.select().from(schema.bounties).where(eq(schema.bounties.id, missing.id))
    expect(refunded?.refundedCents).toBe(300000)

    // A new missing-person bounty is approved onto the board.
    const id = await funded('alexm', {
      kind: 'MISSING_PERSON',
      title: 'Missing: my sister Naledi, 24, last seen in Gardens on 1 November',
      body: 'Naledi left for work on Saturday morning and hasn’t been in touch. Grey coat, blue backpack. Reported at Gardens SAPS; please call 10111 if you see her.',
      amountCents: 150000,
      durationDays: 30,
      sapsCaseNumber: 'CAS 5/11/2026',
      relationship: 'Sister',
      termsAccepted: true,
    })
    expect((await gql(GET, { id }, 'alexm')).data.bounty.status).toBe('PENDING_REVIEW')
    const approved = await gql(`mutation($id: ID!, $note: String!) { approveBounty(id: $id, note: $note) { status } }`, { id, note: 'Case confirmed with Gardens SAPS.' }, 'civicone')
    expect(approved.data.approveBounty.status).toBe('OPEN')
  })

  it('sweeps: abandons unpaid checkouts, expires and refunds, and escalates claims a poster ignores', async () => {
    const SWEEP = `mutation { sweepBounties { abandoned expired escalated } }`
    const { data } = await gql(CREATE, { input: property }, 'alexm')
    const draft = data.createBounty.bounty.id
    await handle.db.update(schema.bounties).set({ createdAt: new Date(Date.now() - 25 * 60 * 60_000) }).where(eq(schema.bounties.id, draft))
    const corolla = await seeded('Silver 2016')
    await handle.db.update(schema.bounties).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.bounties.id, corolla.id))
    const harbor = await seeded('Information on the Harbor')
    await handle.db.update(schema.bountyClaims).set({ createdAt: new Date(Date.now() - 15 * 24 * 60 * 60_000) }).where(eq(schema.bountyClaims.bountyId, harbor.id))

    expect(code(await gql(SWEEP, {}, 'alexm'))).toBe('FORBIDDEN')
    const swept = await gql(SWEEP, {}, 'civicone')
    expect(swept.data.sweepBounties).toMatchObject({ abandoned: 1, expired: 1, escalated: 1 })
    expect((await gql(GET, { id: draft }, 'alexm')).data.bounty.status).toBe('ABANDONED')
    const [expired] = await handle.db.select().from(schema.bounties).where(eq(schema.bounties.id, corolla.id))
    expect(expired).toMatchObject({ status: 'EXPIRED', refundedCents: 500000 })
    expect((await gql(GET, { id: harbor.id }, 'harbor_watch')).data.bounty.claims[0].status).toBe('DISPUTED')
  })

  it('keeps the money honest in the database itself', async () => {
    // Drizzle wraps database errors; the constraint name is on the cause.
    const failsWith = async (promise: Promise<unknown>, pattern: RegExp) => {
      const error = await promise.then(() => null, (e: unknown) => e)
      const messages: string[] = []
      for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) messages.push(String((current as Error).message))
      expect(messages.join(' | ')).toMatch(pattern)
    }
    const bicycle = await seeded('Black Giant')
    const release = (await handle.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.bountyId, bicycle.id))).find((e) => e.type === 'RELEASE')!
    await failsWith(handle.db.update(schema.ledgerEntries).set({ amountCents: 1 }).where(eq(schema.ledgerEntries.id, release.id)), /cannot be changed/)
    await failsWith(handle.db.delete(schema.ledgerEntries).where(eq(schema.ledgerEntries.id, release.id)), /cannot be deleted/)
    await failsWith(handle.db.insert(schema.ledgerEntries).values({ ...release, id: undefined, reference: 'rel-again', idempotencyKey: 'release:again', createdAt: undefined }), /ledger_one_release_idx/)
    await failsWith(handle.db.update(schema.bounties).set({ releasedCents: 80001 }).where(eq(schema.bounties.id, bicycle.id)), /bounties_money_balanced/)
  })

  it('verifies webhook signatures and ignores redelivered events', async () => {
    const provider = paystackProvider('sk_test_secret')
    const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: 42, reference: 'dep-x-1', amount: 100000 } }))
    const signature = createHmac('sha512', 'sk_test_secret').update(body).digest('hex')
    expect(provider.parseWebhook(body, signature)).toMatchObject({ type: 'CHARGE_SUCCESS', reference: 'dep-x-1', eventKey: 'charge.success:42' })
    expect(provider.parseWebhook(body, signature.replace(/^./, 'f'))).toBeNull()
    expect(provider.parseWebhook(body, undefined)).toBeNull()
    expect(provider.parseWebhook(Buffer.from(JSON.stringify({ event: 'transfer.failed', data: { id: 7, reference: 'rel-y-1', transfer_code: 'TRF_1' } })), createHmac('sha512', 'sk_test_secret').update(Buffer.from(JSON.stringify({ event: 'transfer.failed', data: { id: 7, reference: 'rel-y-1', transfer_code: 'TRF_1' } }))).digest('hex'))).toMatchObject({ type: 'TRANSFER', status: 'FAILED', providerRef: 'TRF_1' })

    const ctx = { db: handle.db, payments }
    expect(await handleProviderEvent(ctx, { type: 'IGNORED', eventKey: 'evt-1', eventType: 'subscription.create' }, '{}')).toBe('IGNORED')
    expect(await handleProviderEvent(ctx, { type: 'IGNORED', eventKey: 'evt-1', eventType: 'subscription.create' }, '{}')).toBe('DUPLICATE')
  })

  it('links one bank account to one person, and payouts wait for a new account', async () => {
    const SET = `mutation($input: PayoutAccountInput!) { setPayoutAccount(input: $input) { bankName accountLast4 readyAt } }`
    const set = await gql(SET, { input: { bankCode: '250655', accountNumber: '62 123 456 789', accountName: 'Thandi Mokoena' } }, 'thandi_m')
    expect(set.data.setPayoutAccount).toMatchObject({ bankName: 'FNB', accountLast4: '6789' })
    expect(Date.parse(set.data.setPayoutAccount.readyAt) - Date.now()).toBeGreaterThan(71 * 60 * 60_000)
    expect((await gql(SET, { input: { bankCode: '250655', accountNumber: '62123456789', accountName: 'A Morgan' } }, 'alexm')).errors?.[0]?.message).toMatch(/already linked/)
    expect(code(await gql(SET, { input: { bankCode: '000000', accountNumber: '123456', accountName: 'X' } }, 'alexm'))).toBe('BAD_USER_INPUT')

    // Thandi claims a bounty and is confirmed, but her account is too new to be paid.
    const id = await funded('alexm')
    const claim = (await gql(CLAIM, { bountyId: id, input: { body: claimBody, attested: true } }, 'thandi_m')).data.submitClaim
    expect(code(await gql(CLAIM, { bountyId: id, input: { body: claimBody, attested: true } }, 'thandi_m'))).toBe('BAD_USER_INPUT')
    await gql(CONFIRM, { id: claim.id }, 'alexm')
    await handle.db.update(schema.bountyClaims).set({ cooldownUntil: new Date(Date.now() - 1000) }).where(eq(schema.bountyClaims.id, claim.id))
    expect((await gql(DECIDE, { id: claim.id, decision: 'VERIFY', reason: 'VERIFIED', note: 'ok' }, 'civicone')).errors?.[0]?.message).toMatch(/on hold until/)
  })

  it('blocks deleting an account while money is held for it', async () => {
    const DELETE = `mutation($handle: String!) { deleteAccount(handle: $handle) }`
    const blocked = await gql(DELETE, { handle: 'jordan_o' }, 'jordan_o')
    expect(code(blocked)).toBe('BAD_USER_INPUT')
    expect(blocked.errors?.[0]?.extensions.bountyIds).toHaveLength(1)
    const corolla = await seeded('Silver 2016')
    await gql(`mutation($id: ID!) { cancelBounty(id: $id) { id } }`, { id: corolla.id }, 'jordan_o')
    expect((await gql(DELETE, { handle: 'jordan_o' }, 'jordan_o')).data.deleteAccount).toBe(true)
    // The money records outlive the account.
    const bicycle = await seeded('Black Giant')
    expect((await gql(GET, { id: bicycle.id })).data.bounty.status).toBe('PAID')
    const [claim] = await handle.db.select().from(schema.bountyClaims).where(eq(schema.bountyClaims.bountyId, bicycle.id))
    expect(claim?.claimantId).toBeNull()
  })

  it('never hands an admin handle to a new sign-in', async () => {
    const { resolveViewer: resolve } = await import('../src/data/users')
    const user = await resolve(handle.db, { kind: 'cognito', sub: 'c0ffee00-0000-4000-8000-00000000beef', email: 'civicone@evil.test', name: 'Imposter' }, undefined, new Set(['civicone']))
    expect(user?.handle).toMatch(/^civicone\d{4}$/)
    expect((await gql(`{ viewer { viewerIsAdmin } }`, {}, 'civicone')).data.viewer.viewerIsAdmin).toBe(true)
    expect((await gql(`{ viewer { viewerIsAdmin } }`, {}, 'alexm')).data.viewer.viewerIsAdmin).toBe(false)
  })
})
