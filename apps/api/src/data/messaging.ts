import { messageBodySchema } from '@civic/core/schemas'
import { type Conversation, type ConversationMember, type Database, type Message, schema, type User } from '@civic/db'
import DataLoader from 'dataloader'
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, ne, or, sql } from 'drizzle-orm'
import { apiError } from '../errors'
import { type Connection, decodeCursor, type PageArgs, pageSize, toConnection } from './pagination'

const { conversations, conversationMembers, messages, follows, users, directKey } = schema

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MUTUALS_ONLY = 'You can message people who follow you and whom you follow back.'

/** Messages after a member's read marker count as unread; never-read members have read nothing. */
const readMarker = sql`coalesce(${conversationMembers.lastReadAt}, '-infinity'::timestamptz)`

/** Both people follow each other: the only pairs who can exchange messages. */
async function areMutuals(db: Database, a: string, b: string): Promise<boolean> {
  const rows = await db
    .select({ id: follows.followerId })
    .from(follows)
    .where(or(and(eq(follows.followerId, a), eq(follows.followeeId, b)), and(eq(follows.followerId, b), eq(follows.followeeId, a))))
  return rows.length === 2
}

/** Finds the one-to-one conversation with `userId`, creating it on first use. */
export async function startConversation(db: Database, viewer: User, userId: string): Promise<Conversation> {
  if (userId === viewer.id) throw apiError('BAD_USER_INPUT', 'You can’t message yourself')
  if (!UUID.test(userId)) throw apiError('NOT_FOUND', 'User not found')
  if (!(await areMutuals(db, viewer.id, userId))) throw apiError('FORBIDDEN', MUTUALS_ONLY)

  const key = directKey(viewer.id, userId)
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(conversations).values({ directKey: key }).onConflictDoNothing().returning()
    if (created) {
      await tx.insert(conversationMembers).values([
        { conversationId: created.id, userId: viewer.id },
        { conversationId: created.id, userId },
      ])
      return created
    }
    // Already exists, or another request created it a moment ago (the insert waited for it to commit).
    const [existing] = await tx.select().from(conversations).where(eq(conversations.directKey, key))
    return existing!
  })
}

/** Member ids of a conversation the viewer belongs to; NOT_FOUND otherwise, so ids can't be probed. */
async function membersOf(db: Database, viewer: User, conversationId: string): Promise<string[]> {
  const rows = UUID.test(conversationId)
    ? await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId))
    : []
  if (!rows.some((row) => row.userId === viewer.id)) throw apiError('NOT_FOUND', 'Conversation not found')
  return rows.map((row) => row.userId)
}

/**
 * Stores a message, moves the conversation to the top of everyone's inbox and
 * marks it read for the sender. Mutual follows are re-checked on every send,
 * so unfollowing someone also stops them messaging you.
 */
export async function sendMessage(db: Database, sender: User, conversationId: string, raw: string): Promise<{ message: Message; memberIds: string[] }> {
  const parsed = messageBodySchema.safeParse(raw)
  if (!parsed.success) throw apiError('BAD_USER_INPUT', parsed.error.issues[0]?.message ?? 'Invalid message')

  const memberIds = await membersOf(db, sender, conversationId)
  for (const other of memberIds.filter((id) => id !== sender.id)) {
    if (!(await areMutuals(db, sender.id, other))) throw apiError('FORBIDDEN', MUTUALS_ONLY)
  }

  const message = await db.transaction(async (tx) => {
    const [row] = await tx.insert(messages).values({ conversationId, senderId: sender.id, body: parsed.data }).returning()
    await tx.update(conversations).set({ lastMessageAt: row!.createdAt }).where(eq(conversations.id, conversationId))
    await tx
      .update(conversationMembers)
      .set({ lastReadAt: row!.createdAt })
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, sender.id)))
    return row!
  })
  return { message, memberIds }
}

/**
 * Moves the viewer's read marker to the newest message. Uses the stored
 * `last_message_at` rather than the clock, so a message committing at the
 * same moment is never marked read unseen.
 */
export async function markConversationRead(db: Database, viewer: User, conversationId: string): Promise<void> {
  await membersOf(db, viewer, conversationId)
  await db
    .update(conversationMembers)
    .set({ lastReadAt: sql`(select ${conversations.lastMessageAt} from ${conversations} where ${conversations.id} = ${conversationId}::uuid)` })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, viewer.id)))
}

/** The viewer's conversations that have messages, most recent activity first. */
export async function pageConversations(db: Database, viewerId: string, args: PageArgs): Promise<Connection<Conversation>> {
  const limit = pageSize(args)
  const cursor = args.after ? decodeCursor(args.after) : null
  const rows = await db
    .select({ conversation: conversations })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, viewerId),
        isNotNull(conversations.lastMessageAt),
        cursor ? sql`(${conversations.lastMessageAt}, ${conversations.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined,
      ),
    )
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
    .limit(limit + 1)
  // Same opaque (timestamp, id) cursor as every other list, keyed on the inbox's sort column.
  const page = toConnection(
    rows.map(({ conversation }) => ({ id: conversation.id, createdAt: conversation.lastMessageAt!, conversation })),
    limit,
    cursor !== null,
  )
  return { ...page, edges: page.edges.map(({ cursor: edgeCursor, node }) => ({ cursor: edgeCursor, node: node.conversation })) }
}

/** Newest first; the app shows them bottom-up like any chat. */
export async function pageMessages(db: Database, conversationId: string, args: PageArgs): Promise<Connection<Message>> {
  const limit = pageSize(args)
  const cursor = args.after ? decodeCursor(args.after) : null
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        cursor ? sql`(${messages.createdAt}, ${messages.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1)
  return toConnection(rows, limit, cursor !== null)
}

/** People the viewer can message (mutual follows), optionally narrowed by handle or name. */
export async function messageContacts(db: Database, viewerId: string, query: string, limit: number): Promise<User[]> {
  const followsBack = db.select({ id: follows.followerId }).from(follows).where(eq(follows.followeeId, viewerId))
  const q = query.trim().replace(/^@/, '')
  return db
    .select({ user: users })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(
      and(
        eq(follows.followerId, viewerId),
        inArray(follows.followeeId, followsBack),
        q ? or(ilike(users.handle, `%${q}%`), ilike(users.displayName, `%${q}%`)) : undefined,
      ),
    )
    .orderBy(asc(users.displayName))
    .limit(limit)
    .then((rows) => rows.map((row) => row.user))
}

/** Request-scoped batch loaders for conversations; spread into the request's loaders. */
export function createMessagingLoaders(db: Database, viewerId: () => Promise<string | null>) {
  return {
    conversation: new DataLoader<string, Conversation | null>(async (ids) => {
      const rows = await db.select().from(conversations).where(inArray(conversations.id, [...ids]))
      const map = new Map(rows.map((row) => [row.id, row]))
      return ids.map((id) => map.get(id) ?? null)
    }),
    /** The viewer's own membership row; null when the viewer is not in the conversation. */
    membership: new DataLoader<string, ConversationMember | null>(async (ids) => {
      const viewer = await viewerId()
      if (!viewer) return ids.map(() => null)
      const rows = await db
        .select()
        .from(conversationMembers)
        .where(and(eq(conversationMembers.userId, viewer), inArray(conversationMembers.conversationId, [...ids])))
      const map = new Map(rows.map((row) => [row.conversationId, row]))
      return ids.map((id) => map.get(id) ?? null)
    }),
    memberIds: new DataLoader<string, string[]>(async (ids) => {
      const rows = await db.select().from(conversationMembers).where(inArray(conversationMembers.conversationId, [...ids]))
      return ids.map((id) => rows.filter((row) => row.conversationId === id).map((row) => row.userId))
    }),
    lastMessage: new DataLoader<string, Message | null>(async (ids) => {
      const rows = await db
        .selectDistinctOn([messages.conversationId])
        .from(messages)
        .where(inArray(messages.conversationId, [...ids]))
        .orderBy(messages.conversationId, desc(messages.createdAt), desc(messages.id))
      const map = new Map(rows.map((row) => [row.conversationId, row]))
      return ids.map((id) => map.get(id) ?? null)
    }),
    unreadCount: new DataLoader<string, number>(async (ids) => {
      const viewer = await viewerId()
      if (!viewer) return ids.map(() => 0)
      const rows = await db
        .select({ id: messages.conversationId, n: count() })
        .from(messages)
        .innerJoin(conversationMembers, and(eq(conversationMembers.conversationId, messages.conversationId), eq(conversationMembers.userId, viewer)))
        .where(and(inArray(messages.conversationId, [...ids]), ne(messages.senderId, viewer), sql`${messages.createdAt} > ${readMarker}`))
        .groupBy(messages.conversationId)
      const map = new Map(rows.map((row) => [row.id, Number(row.n)]))
      return ids.map((id) => map.get(id) ?? 0)
    }),
    /** Whether each user follows the viewer; with `following` this decides who can be messaged. */
    followsViewer: new DataLoader<string, boolean>(async (userIds) => {
      const viewer = await viewerId()
      if (!viewer) return userIds.map(() => false)
      const rows = await db
        .select({ id: follows.followerId })
        .from(follows)
        .where(and(eq(follows.followeeId, viewer), inArray(follows.followerId, [...userIds])))
      const hit = new Set(rows.map((row) => row.id))
      return userIds.map((id) => hit.has(id))
    }),
  }
}

/** Conversations with messages the user hasn't read: the number on the Messages badge. */
export async function unreadConversationCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.userId, userId), sql`${conversations.lastMessageAt} > ${readMarker}`))
  return Number(row?.n ?? 0)
}
