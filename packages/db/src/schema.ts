import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  customType,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

/*
 * Two generated columns are deliberately NOT declared here and live in
 * migrations/0002_geo_search.sql instead:
 *   posts.location  geography(Point, 4326)  from (lng, lat), GiST-indexed for ST_DWithin
 *   posts.search    tsvector                from body, GIN-indexed for full-text search
 * Keeping them out of the Drizzle model means ordinary selects never ship
 * binary geography/tsvector payloads over the RDS Data API.
 */

const citext = customType<{ data: string }>({ dataType: () => 'citext' })

// Millisecond precision so cursors built from JS Dates round-trip exactly.
const ts = () => timestamp({ withTimezone: true, precision: 3 })
const createdAt = () => ts().notNull().defaultNow()

export const userRole = pgEnum('user_role', ['MEMBER', 'REPORTER', 'OFFICIAL', 'NEWSROOM', 'SUPPORT'])
export const postKind = pgEnum('post_kind', ['UPDATE', 'ALERT', 'ADVISORY'])
export const alertSeverity = pgEnum('alert_severity', ['INFO', 'ADVISORY', 'WARNING', 'CRITICAL'])

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  /** Cognito `sub`. Null for seeded/system accounts. */
  authSub: text().unique(),
  handle: citext().notNull().unique(),
  displayName: text().notNull(),
  bio: text().notNull().default(''),
  avatarUrl: text(),
  role: userRole().notNull().default('MEMBER'),
  verifiedAt: ts(),
  createdAt: createdAt(),
})

export const posts = pgTable(
  'posts',
  {
    id: uuid().primaryKey().defaultRandom(),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    replyToId: uuid().references((): AnyPgColumn => posts.id, { onDelete: 'cascade' }),
    kind: postKind().notNull().default('UPDATE'),
    body: text().notNull(),
    severity: alertSeverity(),
    area: text(),
    category: text(),
    lat: doublePrecision(),
    lng: doublePrecision(),
    replyCount: integer().notNull().default(0),
    likeCount: integer().notNull().default(0),
    repostCount: integer().notNull().default(0),
    createdAt: createdAt(),
    deletedAt: ts(),
  },
  (t) => [
    index('posts_timeline_idx')
      .on(t.createdAt.desc(), t.id.desc())
      .where(sql`${t.replyToId} is null and ${t.deletedAt} is null`),
    index('posts_alerts_idx')
      .on(t.createdAt.desc(), t.id.desc())
      .where(sql`${t.kind} <> 'UPDATE' and ${t.deletedAt} is null`),
    index('posts_author_idx').on(t.authorId, t.createdAt.desc()),
    index('posts_replies_idx').on(t.replyToId, t.createdAt),
  ],
)

export const postMedia = pgTable(
  'post_media',
  {
    id: uuid().primaryKey().defaultRandom(),
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    url: text().notNull(),
    alt: text().notNull().default(''),
    width: integer(),
    height: integer(),
    caption: text(),
    position: integer().notNull().default(0),
  },
  (t) => [index('post_media_post_idx').on(t.postId, t.position)],
)

const edge = (name: string, target: () => AnyPgColumn) =>
  pgTable(
    name,
    {
      userId: uuid()
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      postId: uuid()
        .notNull()
        .references(target, { onDelete: 'cascade' }),
      createdAt: createdAt(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.postId] }), index(`${name}_post_idx`).on(t.postId)],
  )

export const likes = edge('likes', () => posts.id)
export const saves = edge('saves', () => posts.id)
export const reposts = edge('reposts', () => posts.id)

export const follows = pgTable(
  'follows',
  {
    followerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] }), index('follows_followee_idx').on(t.followeeId)],
)

export const topics = pgTable('topics', {
  id: uuid().primaryKey().defaultRandom(),
  slug: citext().notNull().unique(),
  title: text().notNull(),
  /** Display category, e.g. "Public safety", "Community", "Traffic". */
  category: text().notNull().default('Community'),
  createdAt: createdAt(),
})

export const postTopics = pgTable(
  'post_topics',
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.topicId] }), index('post_topics_topic_idx').on(t.topicId)],
)

export type User = typeof users.$inferSelect
export type Post = typeof posts.$inferSelect
export type PostMedia = typeof postMedia.$inferSelect
export type Topic = typeof topics.$inferSelect
