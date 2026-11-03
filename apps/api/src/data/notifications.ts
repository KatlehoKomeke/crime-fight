import { type Database, schema } from '@civic/db'
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { alias, type AnyPgColumn, unionAll } from 'drizzle-orm/pg-core'
import { type Connection, decodeCursor, type PageArgs, pageSize, toConnection } from './pagination'
import { filters } from './posts'

const { posts, likes, reposts, follows } = schema

export const NOTIFICATION_KINDS = ['ALERT', 'REPLY', 'LIKE', 'REPOST', 'FOLLOW'] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export interface Notification {
  /** The kind plus the key of the row behind it, e.g. `LIKE:<user id>:<post id>`. */
  id: string
  kind: NotificationKind
  /** The alert's author, or whoever replied, liked, reposted or followed. */
  actorId: string
  /** The alert, the reply, or the viewer's post that was liked or reposted. Null for follows. */
  postId: string | null
  createdAt: Date
}

const NOTIFICATION_ID = /^[A-Z]+(:[0-9a-f-]{36}){1,2}$/

/**
 * Every source selects the same columns so they can be unioned. All the
 * created_at columns share one type, so they decode like posts.created_at.
 */
const columns = (kind: NotificationKind, key: AnyPgColumn[], actorId: AnyPgColumn, postId: AnyPgColumn | null, createdAt: AnyPgColumn) => ({
  id: sql<string>`concat_ws(':', ${kind}::text, ${sql.join(key, sql`, `)})`.as('id'),
  kind: sql<NotificationKind>`${kind}::text`.as('kind'),
  actorId: sql<string>`${actorId}`.as('actor_id'),
  postId: sql<string | null>`${postId ?? sql`null::uuid`}`.as('post_id'),
  createdAt: sql`${createdAt}`.mapWith(posts.createdAt).as('created_at'),
})

/** Replies to, likes and reposts of the viewer's posts, and new followers. Never the viewer's own actions. */
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
  ] as const
}

/**
 * Newest-first keyset page of official alerts and advisories merged with the
 * viewer's activity. Anonymous viewers get alerts only.
 * Derived from the posts, likes, reposts and follows tables, so there is
 * nothing extra to write when someone interacts.
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
