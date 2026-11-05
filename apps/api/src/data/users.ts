import { type Database, schema, type User } from '@civic/db'
import { and, desc, eq, isNotNull, ne, notInArray, sql } from 'drizzle-orm'
import type { Identity } from '../auth'
import { apiError } from '../errors'
import type { SignIns } from '../sign-ins'
import { type Connection, decodeCursor, type PageArgs, pageSize, toConnection } from './pagination'

const { users, follows } = schema

const sanitizeHandle = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 15)
    .padEnd(3, '0')

/**
 * Maps an authenticated identity to a user row, provisioning one on first
 * sign-in (Cognito `sub` → `users.auth_sub`). Avoids a separate Cognito
 * post-confirmation Lambda. The name seeds the profile once and stays
 * editable; the email follows the identity provider.
 */
/**
 * The user for a verified identity, created on first sign-in. With `signIns`, a
 * new user is only created while the sign-in still exists: a deleted account's
 * ID tokens stay valid for up to an hour, and another signed-in tab must not
 * bring the account back.
 */
export async function resolveViewer(db: Database, identity: Identity, signIns?: SignIns, reservedHandles: ReadonlySet<string> = new Set()): Promise<User | null> {
  if (identity.kind === 'dev') {
    const [row] = await db.select().from(users).where(eq(users.handle, identity.handle.toLowerCase()))
    return row ?? null
  }

  const email = identity.email ?? null
  const [existing] = await db.select().from(users).where(eq(users.authSub, identity.sub))
  if (existing) {
    if (existing.email === email) return existing
    const [updated] = await db.update(users).set({ email }).where(eq(users.id, existing.id)).returning()
    return updated ?? existing
  }
  if (signIns && !(await signIns.exists(identity))) {
    throw apiError('UNAUTHENTICATED', 'This account has been deleted.', { http: { status: 401 } })
  }

  const base = sanitizeHandle(identity.preferredUsername ?? identity.email?.split('@')[0] ?? 'neighbour')
  for (let attempt = 0; attempt < 5; attempt++) {
    // Admin handles are never handed out by sign-in: an email like admin@anywhere must not inherit the role.
    const handle = attempt === 0 && !reservedHandles.has(base) ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`
    if (reservedHandles.has(handle)) continue
    const [created] = await db
      .insert(users)
      .values({ authSub: identity.sub, handle, email, displayName: identity.name ?? identity.preferredUsername ?? handle })
      .onConflictDoNothing()
      .returning()
    if (created) return created
    // Either the handle was taken or a concurrent request already provisioned this sub.
    const [raced] = await db.select().from(users).where(eq(users.authSub, identity.sub))
    if (raced) return raced
  }
  throw new Error('Could not allocate a handle')
}

/** Verified non-member accounts the viewer does not follow yet. */
export async function trustedSources(db: Database, viewerId: string | null, limit: number): Promise<User[]> {
  const followed = viewerId
    ? db.select({ id: follows.followeeId }).from(follows).where(eq(follows.followerId, viewerId))
    : undefined
  return db
    .select()
    .from(users)
    .where(
      and(
        isNotNull(users.verifiedAt),
        ne(users.role, 'MEMBER'),
        viewerId ? ne(users.id, viewerId) : undefined,
        followed ? notInArray(users.id, followed) : undefined,
      ),
    )
    .orderBy(desc(users.verifiedAt), users.handle)
    .limit(limit)
}

/** Who follows `userId` (`followers`) or whom `userId` follows (`following`), most recent follow first. */
export async function pageFollows(db: Database, userId: string, direction: 'followers' | 'following', args: PageArgs): Promise<Connection<User>> {
  const limit = pageSize(args)
  const cursor = args.after ? decodeCursor(args.after) : null
  const [self, other] = direction === 'followers' ? [follows.followeeId, follows.followerId] : [follows.followerId, follows.followeeId]
  const rows = await db
    .select({ user: users, followedAt: follows.createdAt })
    .from(follows)
    .innerJoin(users, eq(users.id, other))
    .where(and(eq(self, userId), cursor ? sql`(${follows.createdAt}, ${other}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : undefined))
    .orderBy(desc(follows.createdAt), desc(other))
    .limit(limit + 1)
  // Same opaque (timestamp, id) cursor as every other list, keyed on when the follow happened.
  const page = toConnection(
    rows.map(({ user, followedAt }) => ({ id: user.id, createdAt: followedAt, user })),
    limit,
    cursor !== null,
  )
  return { ...page, edges: page.edges.map(({ cursor: edgeCursor, node }) => ({ cursor: edgeCursor, node: node.user })) }
}

export async function searchUsers(db: Database, query: string, limit: number): Promise<User[]> {
  const q = query.trim()
  if (!q) return []
  return db
    .select()
    .from(users)
    .where(sql`${users.handle} % ${q} or ${users.displayName} ilike ${`%${q}%`}`)
    .orderBy(sql`similarity(${users.handle}::text, ${q}) desc`, desc(users.verifiedAt))
    .limit(limit)
}
