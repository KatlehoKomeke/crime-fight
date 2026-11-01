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
import { createAuthenticator } from '../src/auth'
import { resolveViewer } from '../src/data/users'
import { readEnv } from '../src/env'
import { attachLocalRealtime } from '../src/realtime/local-server'
import { memoryHub } from '../src/realtime/publisher'
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
  api = createApi({ db: handle.db, env: readEnv({ STAGE: 'test', AUTH_MODE: 'dev' }), realtime: hub })
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
