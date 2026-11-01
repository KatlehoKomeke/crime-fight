import { type Database, schema, type User } from '@civic/db'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

const { users, posts, likes, reposts, conversations, conversationMembers } = schema

/**
 * Permanently deletes an account. Foreign keys cascade from the user row to
 * their posts (and every reply under them), likes, saves, reposts, follows,
 * memberships and messages. Before that, counters on other people's posts give
 * back what this account added, and its conversations are deleted whole: they
 * are one-to-one, so the other person has no one left to talk to there.
 */
export async function deleteAccount(db: Database, viewer: User): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({ likeCount: sql`greatest(${posts.likeCount} - 1, 0)` })
      .where(inArray(posts.id, tx.select({ id: likes.postId }).from(likes).where(eq(likes.userId, viewer.id))))
    await tx
      .update(posts)
      .set({ repostCount: sql`greatest(${posts.repostCount} - 1, 0)` })
      .where(inArray(posts.id, tx.select({ id: reposts.postId }).from(reposts).where(eq(reposts.userId, viewer.id))))

    // Replies already deleted gave their count back at the time.
    const replies = tx
      .select({ parentId: posts.replyToId, count: sql<number>`count(*)::int`.as('count') })
      .from(posts)
      .where(and(eq(posts.authorId, viewer.id), isNotNull(posts.replyToId), isNull(posts.deletedAt)))
      .groupBy(posts.replyToId)
      .as('replies')
    await tx
      .update(posts)
      .set({ replyCount: sql`greatest(${posts.replyCount} - ${replies.count}, 0)` })
      .from(replies)
      .where(eq(posts.id, replies.parentId))

    const memberOf = tx.select({ id: conversationMembers.conversationId }).from(conversationMembers).where(eq(conversationMembers.userId, viewer.id))
    await tx.delete(conversations).where(inArray(conversations.id, memberOf))
    await tx.delete(users).where(eq(users.id, viewer.id))
  })
}
