import {
  ALERT_SEVERITIES,
  BOUNTY_EVENT_KINDS,
  BOUNTY_KINDS,
  BOUNTY_REPORT_REASONS,
  BOUNTY_STATUSES,
  CLAIM_DECISION_REASONS,
  CLAIM_STATUSES,
  LEDGER_STATUSES,
  LEDGER_TYPES,
  PAYOUT_ACCOUNT_STATUSES,
  POST_KINDS,
  USER_ROLES,
} from '@civic/core'
import { type SQL, sql } from 'drizzle-orm'
import { type AnyPgColumn, boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

/*
 * One generated column is deliberately NOT declared here and lives in
 * migrations/0002_geo_search.sql instead:
 *   posts.search    tsvector                from body, GIN-indexed for full-text search
 * Keeping it out of the Drizzle model means ordinary selects never ship
 * tsvector payloads over the RDS Data API. (Post locations, and the
 * geography column 0002 also added, were dropped in 0005.)
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
    /** From the identity provider, kept current on every sign-in. The API shows it to its owner only. */
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

/*
 * Direct messages. Membership is a table, not two columns, so group
 * conversations can be added later without reshaping the data; for now every
 * conversation is between exactly two people.
 */
/** `conversations.direct_key` for two users: sorted, so either member computes the same key. */
export const directKey = (a: string, b: string) => [a, b].sort().join(':')

export const conversations = pgTable('conversations', {
  id: uuid().primaryKey().defaultRandom(),
  /** See `directKey`: at most one conversation per pair. */
  directKey: text().unique(),
  /** Orders the inbox. Null until the first message, so empty conversations stay hidden. */
  lastMessageAt: ts(),
  createdAt: createdAt(),
})

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Messages after this are unread. Sending a message moves it forward. */
    lastReadAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index('conversation_members_user_idx').on(t.userId)],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt.desc(), t.id.desc())],
)

/*
 * Bounties. Money is tracked twice on purpose: every movement is a ledger row
 * (what the provider was asked to do and whether it settled), and the bounty
 * carries running totals under a CHECK, so what is released plus what is
 * refunded can never exceed what was paid in. People are `set null` on
 * deletion: financial records outlive accounts (docs/adr/0006-bounties.md).
 */
export const bounties = pgTable(
  'bounties',
  {
    id: uuid().primaryKey().defaultRandom(),
    posterId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** The post reporting the crime, if the bounty was raised from one. */
    postId: uuid().references(() => posts.id, { onDelete: 'set null' }),
    kind: text({ enum: BOUNTY_KINDS }).notNull(),
    status: text({ enum: BOUNTY_STATUSES }).notNull().default('PENDING_PAYMENT'),
    /** Where to go back to when an admin unfreezes. */
    frozenFromStatus: text({ enum: BOUNTY_STATUSES }),
    title: text().notNull(),
    body: text().notNull(),
    area: text(),
    /** "CAS 123/11/2026", normalised. Public on missing-person bounties, members-only otherwise. */
    sapsCaseNumber: text(),
    /** Missing person only: how the poster knows the person. */
    relationship: text(),
    amountCents: integer().notNull(),
    platformFeeCents: integer().notNull().default(0),
    vatCents: integer().notNull().default(0),
    currency: text().notNull().default('ZAR'),
    depositedCents: integer().notNull().default(0),
    releasedCents: integer().notNull().default(0),
    refundedCents: integer().notNull().default(0),
    durationDays: integer().notNull(),
    /** The poster's email at creation: Paystack needs one for checkout. */
    payerEmail: text(),
    termsAcceptedAt: ts().notNull(),
    fundedAt: ts(),
    expiresAt: ts(),
    expiringNotifiedAt: ts(),
    closedAt: ts(),
    /** When it first went on the board; null for one that never did. A closed bounty stays readable by the public only if it was listed. */
    listedAt: ts(),
    /** Taken down by an admin, or hidden once the poster deleted their account: only the poster, admins and claimants can open it. */
    removedAt: ts(),
    winningClaimId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    check('bounties_kind_valid', oneOf(t.kind, BOUNTY_KINDS)),
    check('bounties_status_valid', oneOf(t.status, BOUNTY_STATUSES)),
    check('bounties_frozen_from_valid', oneOf(t.frozenFromStatus, BOUNTY_STATUSES)),
    check('bounties_amount_positive', sql`${t.amountCents} > 0`),
    check('bounties_money_balanced', sql`${t.releasedCents} + ${t.refundedCents} <= ${t.depositedCents}`),
    index('bounties_board_idx')
      .on(t.createdAt.desc(), t.id.desc())
      .where(sql`${t.status} in ('OPEN', 'AWAITING_VERIFICATION', 'RELEASING', 'PAID')`),
    index('bounties_poster_idx').on(t.posterId, t.createdAt.desc()),
    index('bounties_post_idx').on(t.postId),
    index('bounties_status_idx').on(t.status, t.expiresAt),
  ],
)

export const bountyClaims = pgTable(
  'bounty_claims',
  {
    id: uuid().primaryKey().defaultRandom(),
    bountyId: uuid()
      .notNull()
      .references(() => bounties.id, { onDelete: 'cascade' }),
    claimantId: uuid().references(() => users.id, { onDelete: 'set null' }),
    status: text({ enum: CLAIM_STATUSES }).notNull().default('SUBMITTED'),
    body: text().notNull(),
    /** Up to three https links, one per line, shown as text. */
    links: text().notNull().default(''),
    /** Why the poster objected to an approved claim. Poster and admins only. */
    posterNote: text(),
    /** What the poster told the reviewer when confirming. Poster and admins only; the claimant never sees it. */
    confirmNote: text(),
    /** When CIVIC/ONE approved it. Until then the poster sees neither the claim nor who sent it. */
    approvedAt: ts(),
    /** The claimant's dispute of a rejection. */
    disputeNote: text(),
    decisionReason: text({ enum: CLAIM_DECISION_REASONS }),
    decisionNote: text(),
    decidedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** What the admin saw before deciding, as JSON text (see ReleasePreflight). */
    preflight: text(),
    attestedAt: ts().notNull(),
    confirmedAt: ts(),
    /** Earliest an admin may verify: the kind's cooling-off after confirmation. */
    cooldownUntil: ts(),
    rejectedAt: ts(),
    disputedAt: ts(),
    decidedAt: ts(),
    /** The account the payout went to; kept so a dispute can be traced. */
    payoutAccountId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    check('bounty_claims_status_valid', oneOf(t.status, CLAIM_STATUSES)),
    check('bounty_claims_reason_valid', oneOf(t.decisionReason, CLAIM_DECISION_REASONS)),
    index('bounty_claims_bounty_idx').on(t.bountyId, t.createdAt),
    index('bounty_claims_claimant_idx').on(t.claimantId, t.createdAt.desc()),
    // One live claim per person per bounty, and at most one that CIVIC/ONE has approved.
    uniqueIndex('bounty_claims_one_live_idx')
      .on(t.bountyId, t.claimantId)
      .where(sql`${t.status} in ('SUBMITTED', 'APPROVED', 'CONFIRMED', 'DISPUTED', 'VERIFIED', 'PAID')`),
    uniqueIndex('bounty_claims_one_winner_idx')
      .on(t.bountyId)
      .where(sql`${t.status} in ('APPROVED', 'CONFIRMED', 'DISPUTED', 'VERIFIED', 'PAID')`),
  ],
)

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    bountyId: uuid()
      .notNull()
      .references(() => bounties.id, { onDelete: 'restrict' }),
    claimId: uuid().references(() => bountyClaims.id, { onDelete: 'set null' }),
    /** Who paid (deposit, refund) or is paid (release). */
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    type: text({ enum: LEDGER_TYPES }).notNull(),
    status: text({ enum: LEDGER_STATUSES }).notNull().default('PENDING'),
    amountCents: integer().notNull(),
    currency: text().notNull().default('ZAR'),
    provider: text().notNull(),
    /** Our reference, which the provider echoes back (Paystack reference / transfer reference). */
    reference: text().notNull().unique(),
    /** The provider's id for it: transaction id, transfer code, refund id. */
    providerRef: text(),
    providerFeeCents: integer(),
    /** Deterministic, e.g. `release:<claim id>`, so a retried step never moves money twice. */
    idempotencyKey: text().notNull().unique(),
    note: text(),
    createdAt: createdAt(),
    settledAt: ts(),
  },
  (t) => [
    check('ledger_type_valid', oneOf(t.type, LEDGER_TYPES)),
    check('ledger_status_valid', oneOf(t.status, LEDGER_STATUSES)),
    check('ledger_amount_positive', sql`${t.amountCents} > 0`),
    index('ledger_bounty_idx').on(t.bountyId, t.createdAt),
    index('ledger_pending_idx').on(t.status, t.createdAt).where(sql`${t.status} = 'PENDING'`),
    // One payout and one live deposit per bounty, enforced by the database rather than by code paths.
    uniqueIndex('ledger_one_release_idx')
      .on(t.bountyId)
      .where(sql`${t.type} = 'RELEASE' and ${t.status} in ('PENDING', 'SETTLED')`),
    uniqueIndex('ledger_one_live_deposit_idx')
      .on(t.bountyId)
      .where(sql`${t.type} = 'DEPOSIT' and ${t.status} in ('PENDING', 'SETTLED')`),
  ],
)

/** Every provider event we've handled, so a redelivered webhook is a no-op. */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    /** The provider's event id, or a hash of the body when it has none. */
    eventKey: text().notNull(),
    eventType: text().notNull(),
    reference: text(),
    outcome: text().notNull().default('RECEIVED'),
    payload: text().notNull(),
    receivedAt: createdAt(),
  },
  (t) => [uniqueIndex('payment_events_key_idx').on(t.provider, t.eventKey)],
)

export const payoutAccounts = pgTable(
  'payout_accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    provider: text().notNull(),
    recipientCode: text().notNull(),
    bankCode: text().notNull(),
    bankName: text().notNull(),
    accountName: text().notNull(),
    accountLast4: text().notNull(),
    /** HMAC of bank code + account number: one bank account may back one person, without storing the number. */
    fingerprint: text().notNull(),
    status: text({ enum: PAYOUT_ACCOUNT_STATUSES }).notNull().default('ACTIVE'),
    createdAt: createdAt(),
    replacedAt: ts(),
  },
  (t) => [
    check('payout_accounts_status_valid', oneOf(t.status, PAYOUT_ACCOUNT_STATUSES)),
    uniqueIndex('payout_accounts_one_active_idx').on(t.userId).where(sql`${t.status} = 'ACTIVE'`),
    // Replaced accounts keep their row, so a bank account stays tied to the person who first linked it.
    uniqueIndex('payout_accounts_fingerprint_idx').on(t.fingerprint),
  ],
)

/** The audit trail: public ones make the Activity list, and the ones addressed to someone make their notifications. */
export const bountyEvents = pgTable(
  'bounty_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    bountyId: uuid()
      .notNull()
      .references(() => bounties.id, { onDelete: 'cascade' }),
    claimId: uuid().references(() => bountyClaims.id, { onDelete: 'set null' }),
    kind: text({ enum: BOUNTY_EVENT_KINDS }).notNull(),
    /** Who did it; null for the system. Admin actions are shown as CIVIC/ONE, never by name. */
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    byAdmin: boolean().notNull().default(false),
    /** Who should hear about it; null for events nobody is told about. The record outlives the account. */
    recipientId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Shown on the public Activity trail. */
    isPublic: boolean().notNull().default(false),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    check('bounty_events_kind_valid', oneOf(t.kind, BOUNTY_EVENT_KINDS)),
    index('bounty_events_bounty_idx').on(t.bountyId, t.createdAt),
    index('bounty_events_recipient_idx').on(t.recipientId, t.createdAt.desc()),
  ],
)

export const bountyReports = pgTable(
  'bounty_reports',
  {
    bountyId: uuid()
      .notNull()
      .references(() => bounties.id, { onDelete: 'cascade' }),
    reporterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text({ enum: BOUNTY_REPORT_REASONS }).notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.bountyId, t.reporterId] }), check('bounty_reports_reason_valid', oneOf(t.reason, BOUNTY_REPORT_REASONS))],
)

export type User = typeof users.$inferSelect
export type Post = typeof posts.$inferSelect
export type Bounty = typeof bounties.$inferSelect
export type BountyClaim = typeof bountyClaims.$inferSelect
export type LedgerEntry = typeof ledgerEntries.$inferSelect
export type PayoutAccount = typeof payoutAccounts.$inferSelect
export type BountyEvent = typeof bountyEvents.$inferSelect
export type BountyReport = typeof bountyReports.$inferSelect
export type PostMedia = typeof postMedia.$inferSelect
export type Topic = typeof topics.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type ConversationMember = typeof conversationMembers.$inferSelect
export type Message = typeof messages.$inferSelect
