import type { BountyEventKind } from '@civic/core'
import { type Database, schema } from '@civic/db'
import { and, desc, eq, isNull, ne, or, type SQL, sql } from 'drizzle-orm'
import { alias, type AnyPgColumn, unionAll } from 'drizzle-orm/pg-core'
import { type Connection, decodeCursor, type PageArgs, pageSize, toConnection } from './pagination'
import { filters } from './posts'

const { posts, likes, reposts, follows, bountyEvents, bountyClaims, bounties } = schema

export const NOTIFICATION_KINDS = ['ALERT', 'REPLY', 'LIKE', 'REPOST', 'FOLLOW', 'BOUNTY'] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export interface Notification {
  /** The kind plus the key of the row behind it, e.g. `LIKE:<user id>:<post id>`. */
  id: string
  kind: NotificationKind
  /** The alert's author, or whoever replied, liked, reposted or followed. Null when CIVIC/ONE itself did something to a bounty. */
  actorId: string | null
  /** The alert, the reply, or the viewer's post that was liked or reposted. Null for follows and bounties. */
  postId: string | null
  bountyId: string | null
  bountyEvent: BountyEventKind | null
  note: string | null
  createdAt: Date
}

const NOTIFICATION_ID = /^[A-Z]+(:[0-9a-f-]{36}){1,2}$/

interface BountyColumns {
  bountyId: AnyPgColumn
  eventKind: AnyPgColumn
  note: AnyPgColumn
}

/**
 * Every source selects the same columns so they can be unioned. All the
 * created_at columns share one type, so they decode like posts.created_at.
 */
const columns = (kind: NotificationKind, key: AnyPgColumn[], actorId: AnyPgColumn | SQL, postId: AnyPgColumn | null, createdAt: AnyPgColumn, bounty?: BountyColumns) => ({
  id: sql<string>`concat_ws(':', ${kind}::text, ${sql.join(key, sql`, `)})`.as('id'),
  kind: sql<NotificationKind>`${kind}::text`.as('kind'),
  actorId: sql<string | null>`${actorId}`.as('actor_id'),
  postId: sql<string | null>`${postId ?? sql`null::uuid`}`.as('post_id'),
  bountyId: sql<string | null>`${bounty?.bountyId ?? sql`null::uuid`}`.as('bounty_id'),
  bountyEvent: sql<BountyEventKind | null>`${bounty?.eventKind ?? sql`null::text`}`.as('bounty_event'),
  note: sql<string | null>`${bounty?.note ?? sql`null::text`}`.as('note'),
  createdAt: sql`${createdAt}`.mapWith(posts.createdAt).as('created_at'),
})

/** Replies to, likes and reposts of the viewer's posts, new followers, and bounty events addressed to them. Never the viewer's own actions. */
function activity(db: Database, viewerId: string) {
  const parent = alias(posts, 'parent')
  const reactions = (table: typeof likes | typeof reposts, kind: 'LIKE' | 'REPOST') =>
    db
      .select(columns(kind, [table.userId, table.postId], table.userId, table.postId, table.createdAt))
      .from(table)
      .innerJoin(posts, eq(posts.id, table.postId))
      .where(and(eq(posts.authorId, viewerId), ne(table.userId, viewerId), isNull(posts.deletedAt)))

  return [
    db
      .select(columns('REPLY', [posts.id], posts.authorId, posts.id, posts.createdAt))
      .from(posts)
      .innerJoin(parent, eq(parent.id, posts.replyToId))
      .where(and(eq(parent.authorId, viewerId), ne(posts.authorId, viewerId), isNull(posts.deletedAt), isNull(parent.deletedAt))),
    reactions(likes, 'LIKE'),
    reactions(reposts, 'REPOST'),
    db.select(columns('FOLLOW', [follows.followerId], follows.followerId, null, follows.createdAt)).from(follows).where(eq(follows.followeeId, viewerId)),
    db
      // Admin actions are never attributed by name: the app shows CIVIC/ONE. And a poster isn't told who sent a claim
      // until CIVIC/ONE has approved it.
      .select(
        columns(
          'BOUNTY',
          [bountyEvents.id],
          sql`case when ${bountyEvents.byAdmin} then null when ${bountyEvents.claimId} is not null and ${bountyClaims.approvedAt} is null and ${bounties.posterId} = ${bountyEvents.recipientId} then null else ${bountyEvents.actorId} end`,
          null,
          bountyEvents.createdAt,
          { bountyId: bountyEvents.bountyId, eventKind: bountyEvents.kind, note: bountyEvents.note },
        ),
      )
      .from(bountyEvents)
      .leftJoin(bountyClaims, eq(bountyClaims.id, bountyEvents.claimId))
      .leftJoin(bounties, eq(bounties.id, bountyEvents.bountyId))
      .where(and(eq(bountyEvents.recipientId, viewerId), or(isNull(bountyEvents.actorId), ne(bountyEvents.actorId, viewerId)))),
  ] as const
}

/**
 * Newest-first keyset page of official alerts and advisories merged with the
 * viewer's activity. Anonymous viewers get alerts only.
 * Derived from the posts, likes, reposts, follows and bounty_events tables, so
 * there is nothing extra to write when someone interacts.
 */
export async function pageNotifications(
  db: Database,
  { viewerId }: { viewerId: string | null },
  args: PageArgs,
): Promise<Connection<Notification>> {
  const limit = pageSize(args)
  const cursor = args.after ? decodeCursor(args.after, NOTIFICATION_ID) : null

  const alerts = db
    .select(columns('ALERT', [posts.id], posts.authorId, posts.id, posts.createdAt))
    .from(posts)
    .where(and(isNull(posts.deletedAt), filters.alerts(), viewerId ? ne(posts.authorId, viewerId) : undefined))
  const all = viewerId ? unionAll(alerts, ...activity(db, viewerId)).as('n') : alerts.as('n')

  const rows = await db
    .select()
    .from(all)
    .where(cursor ? sql`(${all.createdAt}, ${all.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::text)` : undefined)
    .orderBy(desc(all.createdAt), desc(all.id))
    .limit(limit + 1)
  return toConnection(rows, limit, cursor !== null)
}
