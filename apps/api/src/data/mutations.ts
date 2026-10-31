import { canPublishAlerts, checkPrivacy, coarsen, extractTopics, hasBlockingFinding } from '@civic/core'
import { createPostSchema, type CreatePostInput } from '@civic/core/schemas'
import { type Database, type Post, schema, type User } from '@civic/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { apiError } from '../errors'

const { posts, postTopics, topics, likes, saves, reposts, follows, users } = schema

const badInput = (message: string, extensions: Record<string, unknown> = {}) => apiError('BAD_USER_INPUT', message, extensions)
const notFound = (what: string) => apiError('NOT_FOUND', `${what} not found`)
const forbidden = (message: string) => apiError('FORBIDDEN', message)

export async function createPost(db: Database, author: User, raw: CreatePostInput): Promise<Post> {
  const parsed = createPostSchema.safeParse(raw)
  if (!parsed.success) {
    throw badInput(parsed.error.issues[0]?.message ?? 'Invalid post', { issues: z.flattenError(parsed.error).fieldErrors })
  }
  const input = parsed.data

  // The client runs the same check as you type; the server is authoritative.
  const findings = checkPrivacy(input.body)
  if (hasBlockingFinding(findings)) {
    throw badInput('This post contains personal information that cannot be published.', {
      privacy: findings.map(({ kind, level, start, end, message }) => ({ kind, level, start, end, message })),
    })
  }

  const official = canPublishAlerts(author.role, author.verifiedAt !== null)
  if (input.kind !== 'UPDATE' && !official) throw forbidden('Only verified officials and newsrooms can publish alerts')
  // Officials report exact incident locations; everyone else is coarsened to ~1 km.
  let at = input.location ?? null
  if (at && !official) at = coarsen(at)

  return db.transaction(async (tx) => {
    if (input.replyToId) {
      const [parent] = await tx
        .update(posts)
        .set({ replyCount: sql`${posts.replyCount} + 1` })
        .where(and(eq(posts.id, input.replyToId), isNull(posts.deletedAt)))
        .returning({ id: posts.id })
      if (!parent) throw notFound('Post being replied to')
    }

    const [post] = await tx
      .insert(posts)
      .values({
        authorId: author.id,
        replyToId: input.replyToId ?? null,
        kind: input.kind,
        severity: input.kind === 'UPDATE' ? null : (input.severity ?? null),
        area: input.area ?? null,
        category: input.category ?? null,
        body: input.body,
        lat: at?.lat ?? null,
        lng: at?.lng ?? null,
      })
      .returning()

    const tags = extractTopics(input.body)
    if (tags.length) {
      await tx
        .insert(topics)
        .values(tags.map((t) => ({ slug: t.slug, title: t.label })))
        .onConflictDoNothing()
      const rows = await tx.select({ id: topics.id }).from(topics).where(inArray(topics.slug, tags.map((t) => t.slug)))
      await tx.insert(postTopics).values(rows.map((row) => ({ postId: post!.id, topicId: row.id })))
    }
    return post!
  })
}

export async function deletePost(db: Database, viewer: User, postId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .update(posts)
      .set({ deletedAt: new Date() })
      .where(and(eq(posts.id, postId), eq(posts.authorId, viewer.id), isNull(posts.deletedAt)))
      .returning({ id: posts.id, replyToId: posts.replyToId })
    if (!deleted) throw notFound('Post')
    if (deleted.replyToId) {
      await tx
        .update(posts)
        .set({ replyCount: sql`greatest(${posts.replyCount} - 1, 0)` })
        .where(eq(posts.id, deleted.replyToId))
    }
    return deleted.id
  })
}

type EdgeTable = typeof likes | typeof saves | typeof reposts
// Raw column names: an UPDATE ... SET target cannot be table-qualified, which is how Drizzle renders columns.
const counterFor = new Map<EdgeTable, 'like_count' | 'repost_count' | null>([
  [likes, 'like_count'],
  [reposts, 'repost_count'],
  [saves, null],
])

/**
 * Adds or removes a like/save/repost and adjusts the post's counter in ONE
 * statement (a data-modifying CTE), so the edge and the count can never drift
 * and the RDS Data API needs a single round trip.
 */
export async function setEdge(db: Database, table: EdgeTable, userId: string, postId: string, on: boolean): Promise<void> {
  const counter = counterFor.get(table) ?? null
  const change = on
    ? sql`insert into ${table} (user_id, post_id) select ${userId}::uuid, id from ${posts} where id = ${postId}::uuid and deleted_at is null on conflict do nothing returning post_id`
    : sql`delete from ${table} where user_id = ${userId}::uuid and post_id = ${postId}::uuid returning post_id`

  if (!counter) {
    await db.execute(change)
    return
  }
  const column = sql.identifier(counter)
  const delta = on ? sql`${column} + 1` : sql`greatest(${column} - 1, 0)`
  await db.execute(sql`with changed as (${change}) update ${posts} set ${column} = ${delta} where id in (select post_id from changed)`)
}

export async function setFollow(db: Database, viewer: User, userId: string, on: boolean): Promise<void> {
  if (userId === viewer.id) throw badInput('You cannot follow yourself')
  if (!on) {
    await db.delete(follows).where(and(eq(follows.followerId, viewer.id), eq(follows.followeeId, userId)))
    return
  }
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId))
  if (!target) throw notFound('User')
  await db.insert(follows).values({ followerId: viewer.id, followeeId: userId }).onConflictDoNothing()
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(160).optional(),
})

export async function updateProfile(db: Database, viewer: User, input: z.input<typeof profileSchema>): Promise<User> {
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) throw badInput(parsed.error.issues[0]?.message ?? 'Invalid profile')
  const [row] = await db.update(users).set(parsed.data).where(eq(users.id, viewer.id)).returning()
  return row!
}
