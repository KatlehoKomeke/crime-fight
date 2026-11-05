import { type Database, schema, type User } from '@civic/db'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { apiError } from '../errors'
import { heldForUser } from './bounties'

const { users, posts, likes, reposts, conversations, conversationMembers, bounties, ledgerEntries, payoutAccounts, bountyClaims } = schema

/**
 * Permanently deletes an account. Foreign keys cascade from the user row to
 * their posts (and every reply under them), likes, saves, reposts, follows,
 * memberships and messages. Before that, counters on other people's posts give
 * back what this account added, and its conversations are deleted whole: they
 * are one-to-one, so the other person has no one left to talk to there.
 *
 * Bounties are different: while CIVIC/ONE holds money for or owes money to the
 * account, it can't go. Afterwards the money records stay (with the person
 * set to null), because they are financial records.
 */
export async function deleteAccount(db: Database, viewer: User): Promise<void> {
  const held = await heldForUser(db, viewer.id)
  if (held.length) {
    throw apiError('BAD_USER_INPUT', 'CIVIC/ONE is holding money for a bounty you posted or claimed. Close or withdraw it first.', { bountyIds: held })
  }

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

    // Bounties never paid for are abandoned; the closed ones come off everyone's screen but CIVIC/ONE's and their claimants'
    // (the money records stay); claims nobody answered are withdrawn; the bank account row is kept, tied to nobody.
    const drafts = tx.select({ id: bounties.id }).from(bounties).where(and(eq(bounties.posterId, viewer.id), eq(bounties.status, 'PENDING_PAYMENT')))
    await tx.update(ledgerEntries).set({ status: 'FAILED', note: 'Account deleted' }).where(and(inArray(ledgerEntries.bountyId, drafts), eq(ledgerEntries.status, 'PENDING')))
    await tx.update(bounties).set({ status: 'ABANDONED', closedAt: new Date() }).where(and(eq(bounties.posterId, viewer.id), eq(bounties.status, 'PENDING_PAYMENT')))
    await tx.update(bounties).set({ removedAt: new Date() }).where(and(eq(bounties.posterId, viewer.id), isNull(bounties.removedAt)))
    await tx.update(bountyClaims).set({ status: 'WITHDRAWN' }).where(and(eq(bountyClaims.claimantId, viewer.id), inArray(bountyClaims.status, ['SUBMITTED', 'REJECTED_BY_POSTER'])))
    await tx.update(payoutAccounts).set({ status: 'REPLACED', replacedAt: new Date() }).where(and(eq(payoutAccounts.userId, viewer.id), eq(payoutAccounts.status, 'ACTIVE')))

    await tx.delete(users).where(eq(users.id, viewer.id))
  })
}
