import { type Database, type Post, schema } from '@civic/db'
import { and, asc, desc, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm'
import { type Connection, decodeCursor, type PageArgs, pageSize, toConnection } from './pagination'

const { posts, postTopics, topics, saves, follows } = schema

// `search` is a generated column outside the Drizzle model (see packages/db/src/schema.ts).
const searchVector = sql`"posts"."search"`

export const filters = {
  topLevel: () => isNull(posts.replyToId),
  following: (viewerId: string) =>
    and(
      isNull(posts.replyToId),
      sql`(${posts.authorId} = ${viewerId}::uuid or ${posts.authorId} in (select ${follows.followeeId} from ${follows} where ${follows.followerId} = ${viewerId}::uuid))`,
    ),
  alerts: () => ne(posts.kind, 'UPDATE'),
  byAuthor: (authorId: string) => and(eq(posts.authorId, authorId), isNull(posts.replyToId)),
  search: (query: string) => sql`${searchVector} @@ websearch_to_tsquery('english', ${query})`,
  topic: (db: Database, slug: string) =>
    inArray(
      posts.id,
      db.select({ id: postTopics.postId }).from(postTopics).innerJoin(topics, eq(topics.id, postTopics.topicId)).where(eq(topics.slug, slug)),
    ),
  savedBy: (db: Database, userId: string) => inArray(posts.id, db.select({ id: saves.postId }).from(saves).where(eq(saves.userId, userId))),
}

/** Newest-first keyset page over non-deleted posts. */
export async function pagePosts(db: Database, where: SQL | undefined, args: PageArgs): Promise<Connection<Post>> {
  const limit = pageSize(args)
  const cursor = args.after ? decodeCursor(args.after) : null
  const rows = await db
    .select()
    .from(posts)
    .where(
      and(
        isNull(posts.deletedAt),
        where,
        cursor ? sql`(${posts.createdAt}, ${posts.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined,
      ),
    )
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1)
  return toConnection(rows, limit, cursor !== null)
}

/** Oldest-first so threads read top to bottom. */
export async function pageReplies(db: Database, postId: string, args: PageArgs): Promise<Connection<Post>> {
  const limit = pageSize(args)
  const cursor = args.after ? decodeCursor(args.after) : null
  const rows = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.replyToId, postId),
        isNull(posts.deletedAt),
        cursor ? sql`(${posts.createdAt}, ${posts.id}) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined,
      ),
    )
    .orderBy(asc(posts.createdAt), asc(posts.id))
    .limit(limit + 1)
  return toConnection(rows, limit, cursor !== null)
}
