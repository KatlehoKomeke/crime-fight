import { sql } from 'drizzle-orm'
import type { Database } from './client'
import {
  bounties,
  bountyClaims,
  bountyEvents,
  conversationMembers,
  conversations,
  directKey,
  follows,
  ledgerEntries,
  messages,
  payoutAccounts,
  postMedia,
  posts,
  postTopics,
  saves,
  topics,
  users,
} from './schema'
import { fillerPosts, seedBounties, seedPosts, seedTopics, seedUsers } from './seed-data'

/** Replaces all data with the demo dataset. Timestamps are relative to now so the feed always looks live. */
export async function seed(db: Database): Promise<{ users: number; posts: number; topics: number }> {
  const now = Date.now()
  const ago = (minutes: number) => new Date(now - minutes * 60_000)

  await db.execute(sql`truncate table users, topics, conversations, bounties, payout_accounts, payment_events restart identity cascade`)

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

  // Bounties, with the money rows a real one would have, so the board, the
  // admin queue and the honoured list all have something to show.
  const [jordanAccount] = await db
    .insert(payoutAccounts)
    .values({
      userId: userId.jordan_o!,
      provider: 'sandbox',
      recipientCode: 'RCP_sandbox_250655_4321',
      bankCode: '250655',
      bankName: 'FNB',
      accountName: 'Jordan Okafor',
      accountLast4: '4321',
      fingerprint: 'seed-jordan-fnb-4321',
      createdAt: ago(60 * 24 * 10),
    })
    .returning({ id: payoutAccounts.id })
  for (const b of seedBounties) {
    const fundedAt = ago(b.fundedMinutesAgo)
    const deposited = b.status === 'PENDING_PAYMENT' ? 0 : b.amountCents
    const [bounty] = await db
      .insert(bounties)
      .values({
        posterId: userId[b.poster]!,
        kind: b.kind,
        status: b.status,
        title: b.title,
        body: b.body,
        area: b.area ?? null,
        sapsCaseNumber: b.sapsCaseNumber ?? null,
        relationship: b.relationship ?? null,
        amountCents: b.amountCents,
        depositedCents: deposited,
        releasedCents: b.status === 'PAID' ? b.amountCents : 0,
        durationDays: b.durationDays,
        payerEmail: `${b.poster}@sandbox.invalid`,
        termsAcceptedAt: ago(b.fundedMinutesAgo + 5),
        fundedAt: deposited ? fundedAt : null,
        expiresAt: deposited ? new Date(fundedAt.getTime() + b.durationDays * 24 * 60 * 60_000) : null,
        closedAt: b.status === 'PAID' ? ago(b.closedMinutesAgo ?? 0) : null,
        createdAt: ago(b.fundedMinutesAgo + 5),
      })
      .returning({ id: bounties.id })
    const id = bounty!.id
    await db.insert(bountyEvents).values({ bountyId: id, kind: 'CREATED', actorId: userId[b.poster]!, createdAt: ago(b.fundedMinutesAgo + 5) })
    if (deposited) {
      await db.insert(ledgerEntries).values({
        bountyId: id,
        userId: userId[b.poster]!,
        type: 'DEPOSIT',
        status: 'SETTLED',
        amountCents: b.amountCents,
        provider: 'sandbox',
        reference: `dep-${id}-1`,
        providerRef: 'seed',
        idempotencyKey: `deposit:${id}:1`,
        createdAt: fundedAt,
        settledAt: fundedAt,
      })
      await db.insert(bountyEvents).values({ bountyId: id, kind: 'FUNDED', actorId: userId[b.poster]!, isPublic: true, createdAt: fundedAt })
    }
    for (const c of b.claims ?? []) {
      const createdAt = ago(c.minutesAgo)
      const [claim] = await db
        .insert(bountyClaims)
        .values({
          bountyId: id,
          claimantId: userId[c.claimant]!,
          status: c.status,
          body: c.body,
          attestedAt: createdAt,
          confirmedAt: c.status === 'PAID' ? ago(c.minutesAgo - 60) : null,
          cooldownUntil: c.status === 'PAID' ? ago(c.minutesAgo - 60 * 73) : null,
          decisionReason: c.status === 'PAID' ? 'VERIFIED' : null,
          decidedAt: c.status === 'PAID' ? ago(b.closedMinutesAgo ?? 0) : null,
          payoutAccountId: c.status === 'PAID' ? jordanAccount!.id : null,
          createdAt,
        })
        .returning({ id: bountyClaims.id })
      await db.insert(bountyEvents).values({ bountyId: id, claimId: claim!.id, kind: 'CLAIM_SUBMITTED', actorId: userId[c.claimant]!, recipientId: userId[b.poster]!, isPublic: true, createdAt })
      if (c.status === 'PAID') {
        const paidAt = ago(b.closedMinutesAgo ?? 0)
        await db.update(bounties).set({ winningClaimId: claim!.id }).where(sql`${bounties.id} = ${id}`)
        await db.insert(ledgerEntries).values({
          bountyId: id,
          claimId: claim!.id,
          userId: userId[c.claimant]!,
          type: 'RELEASE',
          status: 'SETTLED',
          amountCents: b.amountCents,
          provider: 'sandbox',
          reference: `rel-${claim!.id}-1`,
          providerRef: 'seed',
          idempotencyKey: `release:${claim!.id}:1`,
          note: 'Payout to FNB ••••4321',
          createdAt: paidAt,
          settledAt: paidAt,
        })
        await db.insert(bountyEvents).values([
          { bountyId: id, claimId: claim!.id, kind: 'CLAIM_CONFIRMED', actorId: userId[b.poster]!, recipientId: userId[c.claimant]!, isPublic: true, createdAt: ago(c.minutesAgo - 60) },
          { bountyId: id, claimId: claim!.id, kind: 'CLAIM_VERIFIED', byAdmin: true, recipientId: userId[c.claimant]!, isPublic: true, createdAt: paidAt },
          { bountyId: id, claimId: claim!.id, kind: 'PAID', recipientId: userId[c.claimant]!, isPublic: true, createdAt: paidAt },
        ])
      }
    }
  }

  return { users: userRows.length, posts: allPosts.length, topics: topicRows.length }
}
