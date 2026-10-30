import { type Database, schema, type User } from '@civic/db'
import { and, desc, eq, isNotNull, ne, notInArray, sql } from 'drizzle-orm'
import type { Identity } from '../auth'

const { users, follows } = schema

const sanitizeHandle = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 15)
    .padEnd(3, '0')

/**
 * Maps an authenticated identity to a user row, provisioning one on first
 * sign-in. Avoids a separate Cognito post-confirmation Lambda.
 */
export async function resolveViewer(db: Database, identity: Identity): Promise<User | null> {
  if (identity.kind === 'dev') {
    const [row] = await db.select().from(users).where(eq(users.handle, identity.handle))
    return row ?? null
  }

  const [existing] = await db.select().from(users).where(eq(users.authSub, identity.sub))
  if (existing) return existing

  const base = sanitizeHandle(identity.preferredUsername ?? identity.email?.split('@')[0] ?? 'neighbour')
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`
    const [created] = await db
      .insert(users)
      .values({ authSub: identity.sub, handle, displayName: identity.name ?? identity.preferredUsername ?? handle })
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
