import { type Database, schema, type Topic } from '@civic/db'
import { and, count, desc, eq, gt, isNull, max, sql } from 'drizzle-orm'

const { topics, postTopics, posts } = schema

export interface Trend {
  topic: Topic
  postCount: number
}

/** Topics ranked by post volume over a rolling window. */
export async function trending(db: Database, limit: number, windowHours = 24 * 7): Promise<Trend[]> {
  const rows = await db
    .select({ topic: topics, postCount: count(), latest: max(posts.createdAt) })
    .from(topics)
    .innerJoin(postTopics, eq(postTopics.topicId, topics.id))
    .innerJoin(posts, eq(posts.id, postTopics.postId))
    .where(and(isNull(posts.deletedAt), gt(posts.createdAt, sql`now() - make_interval(hours => ${windowHours}::int)`)))
    .groupBy(topics.id)
    .orderBy(desc(count()), desc(max(posts.createdAt)))
    .limit(limit)
  return rows.map((row) => ({ topic: row.topic, postCount: Number(row.postCount) }))
}

export async function topicBySlug(db: Database, slug: string): Promise<Topic | null> {
  const [row] = await db.select().from(topics).where(eq(topics.slug, slug.toLowerCase()))
  return row ?? null
}
