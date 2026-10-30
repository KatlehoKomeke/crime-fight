import { type Database, type Post, type PostMedia, schema, type Topic, type User } from '@civic/db'
import DataLoader from 'dataloader'
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'

const { users, posts, postMedia, postTopics, topics, likes, saves, reposts, follows } = schema

function byId<K, V>(keys: readonly K[], rows: V[], keyOf: (row: V) => K): Array<V | null> {
  const map = new Map(rows.map((row) => [keyOf(row), row]))
  return keys.map((key) => map.get(key) ?? null)
}

function grouped<K, V>(keys: readonly K[], rows: V[], keyOf: (row: V) => K): V[][] {
  const map = new Map<K, V[]>()
  for (const row of rows) map.set(keyOf(row), [...(map.get(keyOf(row)) ?? []), row])
  return keys.map((key) => map.get(key) ?? [])
}

function counts<K>(keys: readonly K[], rows: Array<{ key: K; n: number }>): number[] {
  const map = new Map(rows.map((row) => [row.key, Number(row.n)]))
  return keys.map((key) => map.get(key) ?? 0)
}

/**
 * Request-scoped batch loaders. Every list of N posts resolves authors, media,
 * topics and viewer state in a constant number of queries instead of N.
 */
export function createLoaders(db: Database, viewerId: () => Promise<string | null>) {
  const viewerEdge = (table: typeof likes | typeof saves | typeof reposts) =>
    new DataLoader<string, boolean>(async (postIds) => {
      const viewer = await viewerId()
      if (!viewer) return postIds.map(() => false)
      const rows = await db
        .select({ postId: table.postId })
        .from(table)
        .where(and(eq(table.userId, viewer), inArray(table.postId, [...postIds])))
      const hit = new Set(rows.map((row) => row.postId))
      return postIds.map((id) => hit.has(id))
    })

  return {
    user: new DataLoader<string, User | null>(async (ids) =>
      byId(ids, await db.select().from(users).where(inArray(users.id, [...ids])), (u) => u.id),
    ),
    post: new DataLoader<string, Post | null>(async (ids) =>
      byId(ids, await db.select().from(posts).where(and(inArray(posts.id, [...ids]), isNull(posts.deletedAt))), (p) => p.id),
    ),
    media: new DataLoader<string, PostMedia[]>(async (postIds) =>
      grouped(
        postIds,
        await db.select().from(postMedia).where(inArray(postMedia.postId, [...postIds])).orderBy(asc(postMedia.position)),
        (m) => m.postId,
      ),
    ),
    topics: new DataLoader<string, Topic[]>(async (postIds) => {
      const rows = await db
        .select({ postId: postTopics.postId, topic: topics })
        .from(postTopics)
        .innerJoin(topics, eq(topics.id, postTopics.topicId))
        .where(inArray(postTopics.postId, [...postIds]))
      return grouped(postIds, rows, (r) => r.postId).map((list) => list.map((r) => r.topic))
    }),
    liked: viewerEdge(likes),
    saved: viewerEdge(saves),
    reposted: viewerEdge(reposts),
    following: new DataLoader<string, boolean>(async (userIds) => {
      const viewer = await viewerId()
      if (!viewer) return userIds.map(() => false)
      const rows = await db
        .select({ id: follows.followeeId })
        .from(follows)
        .where(and(eq(follows.followerId, viewer), inArray(follows.followeeId, [...userIds])))
      const hit = new Set(rows.map((row) => row.id))
      return userIds.map((id) => hit.has(id))
    }),
    followerCount: new DataLoader<string, number>(async (ids) =>
      counts(
        ids,
        await db
          .select({ key: follows.followeeId, n: count() })
          .from(follows)
          .where(inArray(follows.followeeId, [...ids]))
          .groupBy(follows.followeeId),
      ),
    ),
    followingCount: new DataLoader<string, number>(async (ids) =>
      counts(
        ids,
        await db
          .select({ key: follows.followerId, n: count() })
          .from(follows)
          .where(inArray(follows.followerId, [...ids]))
          .groupBy(follows.followerId),
      ),
    ),
    postCount: new DataLoader<string, number>(async (ids) =>
      counts(
        ids,
        await db
          .select({ key: posts.authorId, n: count() })
          .from(posts)
          .where(and(inArray(posts.authorId, [...ids]), isNull(posts.deletedAt), isNull(posts.replyToId)))
          .groupBy(posts.authorId),
      ),
    ),
  }
}

export type Loaders = ReturnType<typeof createLoaders>
