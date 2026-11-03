import { sql } from 'drizzle-orm'
import type { Database } from './client'
import { conversationMembers, conversations, directKey, follows, messages, postMedia, posts, postTopics, saves, topics, users } from './schema'
import { fillerPosts, seedPosts, seedTopics, seedUsers } from './seed-data'

/** Replaces all data with the demo dataset. Timestamps are relative to now so the feed always looks live. */
export async function seed(db: Database): Promise<{ users: number; posts: number; topics: number }> {
  const now = Date.now()
  const ago = (minutes: number) => new Date(now - minutes * 60_000)

  await db.execute(sql`truncate table users, topics, conversations restart identity cascade`)

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

  // Messages need mutual follows. The newsroom and the support service follow
  // each other and have a thread going; Victim Support hasn't read the latest.
  const [newsroom, support] = [userId.civicone!, userId.victimsupport!]
  await db.insert(follows).values([
    { followerId: newsroom, followeeId: support },
    { followerId: support, followeeId: newsroom },
  ])
  const thread = [
    { from: newsroom, minutesAgo: 95, body: 'Hi team, we’re publishing an explainer on the SIM-swap fraud wave tonight. Can we point readers to you for support?' },
    { from: support, minutesAgo: 60, body: 'Yes please. Link to our profile rather than a number, and ask readers not to share screenshots that show account details.' },
    { from: newsroom, minutesAgo: 12, body: 'Will do. It goes live at 19:00; I’ll send you the link before then.' },
  ]
  const [conversation] = await db
    .insert(conversations)
    .values({ directKey: directKey(newsroom, support), lastMessageAt: ago(12) })
    .returning({ id: conversations.id })
  await db.insert(conversationMembers).values([
    { conversationId: conversation!.id, userId: newsroom, lastReadAt: ago(12) },
    { conversationId: conversation!.id, userId: support, lastReadAt: ago(60) },
  ])
  await db.insert(messages).values(thread.map((m) => ({ conversationId: conversation!.id, senderId: m.from, body: m.body, createdAt: ago(m.minutesAgo) })))

  return { users: userRows.length, posts: allPosts.length, topics: topicRows.length }
}
