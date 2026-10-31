import { ALERT_SEVERITIES, POST_KINDS, USER_ROLES } from '@civic/core'
import { type SQL, sql } from 'drizzle-orm'
import { type AnyPgColumn, check, doublePrecision, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/*
 * Two generated columns are deliberately NOT declared here and live in
 * migrations/0002_geo_search.sql instead:
 *   posts.location  geography(Point, 4326)  from (lng, lat), GiST-indexed for ST_DWithin
 *   posts.search    tsvector                from body, GIN-indexed for full-text search
 * Keeping them out of the Drizzle model means ordinary selects never ship
 * binary geography/tsvector payloads over the RDS Data API.
 */

// Millisecond precision so cursors built from JS Dates round-trip exactly.
const ts = () => timestamp({ withTimezone: true, precision: 3 })
const createdAt = () => ts().notNull().defaultNow()

/*
 * No Postgres enums or citext: on Lambda the RDS Data API can't return citext
 * values, and it sends parameters as text, which Postgres won't compare with an
 * enum. Plain text with CHECK constraints keeps the same guarantees on every
 * driver. Handles and slugs are stored lowercase, so their unique indexes stay
 * case-insensitive.
 */
const oneOf = (column: AnyPgColumn, values: readonly string[]): SQL => sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`
const lowercase = (column: AnyPgColumn): SQL => sql`${column} = lower(${column})`

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Cognito `sub`. Null for seeded/system accounts. */
    authSub: text().unique(),
    handle: text().notNull().unique(),
    displayName: text().notNull(),
    /** From the identity provider, kept current on every sign-in. Private: never exposed through the API. */
    email: text(),
    bio: text().notNull().default(''),
    avatarUrl: text(),
    role: text({ enum: USER_ROLES }).notNull().default('MEMBER'),
    verifiedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [check('users_handle_lowercase', lowercase(t.handle)), check('users_role_valid', oneOf(t.role, USER_ROLES))],
)

export const posts = pgTable(
  'posts',
  {
    id: uuid().primaryKey().defaultRandom(),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    replyToId: uuid().references((): AnyPgColumn => posts.id, { onDelete: 'cascade' }),
    kind: text({ enum: POST_KINDS }).notNull().default('UPDATE'),
    body: text().notNull(),
    severity: text({ enum: ALERT_SEVERITIES }),
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
    check('posts_kind_valid', oneOf(t.kind, POST_KINDS)),
    // NULL passes a CHECK, so updates without a severity stay valid.
    check('posts_severity_valid', oneOf(t.severity, ALERT_SEVERITIES)),
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

export const topics = pgTable(
  'topics',
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    /** Display category, e.g. "Public safety", "Community", "Traffic". */
    category: text().notNull().default('Community'),
    createdAt: createdAt(),
  },
  (t) => [check('topics_slug_lowercase', lowercase(t.slug))],
)

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
