import { sql } from 'drizzle-orm'
import type { Database } from './client'
import { follows, postMedia, posts, postTopics, saves, topics, users } from './schema'
import { fillerPosts, seedPosts, seedTopics, seedUsers } from './seed-data'

/** Replaces all data with the demo dataset. Timestamps are relative to now so the feed always looks live. */
export async function seed(db: Database): Promise<{ users: number; posts: number; topics: number }> {
  const now = Date.now()
  const ago = (minutes: number) => new Date(now - minutes * 60_000)

  await db.execute(sql`truncate table users, topics restart identity cascade`)

  const userRows = await db
    .insert(users)
    .values(
      seedUsers.map((u) => ({
        handle: u.handle,
        displayName: u.displayName,
        role: u.role,
        bio: u.bio,
        verifiedAt: u.verified ? ago(60 * 24 * 90) : null,
      })),
    )
    .returning({ id: users.id, handle: users.handle })
  const userId = Object.fromEntries(userRows.map((u) => [u.handle, u.id]))

  const topicRows = await db.insert(topics).values(seedTopics).returning({ id: topics.id, slug: topics.slug })
  const topicId = Object.fromEntries(topicRows.map((t) => [t.slug, t.id]))

  const allPosts = [...seedPosts, ...fillerPosts()]
  const postId: Record<string, string> = {}
  // Parents first so replies can reference them.
  for (const p of [...allPosts.filter((post) => !post.replyTo), ...allPosts.filter((post) => post.replyTo)]) {
    const replies = allPosts.filter((r) => r.replyTo === p.key).length
    const [row] = await db
      .insert(posts)
      .values({
        authorId: userId[p.author]!,
        replyToId: p.replyTo ? postId[p.replyTo] : null,
        kind: p.kind ?? 'UPDATE',
        severity: p.severity ?? null,
        area: p.area ?? null,
        category: p.category ?? null,
        body: p.body,
        lat: p.at?.lat ?? null,
        lng: p.at?.lng ?? null,
        likeCount: p.counts?.likes ?? 0,
        repostCount: p.counts?.reposts ?? 0,
        replyCount: (p.counts?.replies ?? 0) + replies,
        createdAt: ago(p.minutesAgo),
      })
      .returning({ id: posts.id })
    postId[p.key] = row!.id

    if (p.media) await db.insert(postMedia).values({ postId: row!.id, ...p.media })
    if (p.topics?.length) {
      await db.insert(postTopics).values(p.topics.map((slug) => ({ postId: row!.id, topicId: topicId[slug]! })))
    }
  }

  await db
    .insert(follows)
    .values(['civicone', 'metro_updates', 'victimsupport'].map((handle) => ({ followerId: userId.alexm!, followeeId: userId[handle]! })))
  await db.insert(saves).values({ userId: userId.alexm!, postId: postId.fraud! })

  return { users: userRows.length, posts: allPosts.length, topics: topicRows.length }
}
