import { apiError } from '../errors'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50

export interface PageArgs {
  first?: number | null
  after?: string | null
  last?: number | null
  before?: string | null
}

export interface Cursor {
  createdAt: string
  id: string
}

export interface Connection<T> {
  edges: Array<{ cursor: string; node: T }>
  pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null }
}

/** Opaque keyset cursor over (created_at, id) so pages never skip or repeat rows. */
export function encodeCursor(row: { createdAt: Date | string; id: string }): string {
  const createdAt = row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString()
  return Buffer.from(JSON.stringify([createdAt, row.id])).toString('base64url')
}

export function decodeCursor(cursor: string): Cursor {
  try {
    const [createdAt, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as [string, string]
    if (Number.isNaN(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('bad cursor')
    return { createdAt, id }
  } catch {
    throw apiError('BAD_USER_INPUT', 'Invalid pagination cursor')
  }
}

export function pageSize({ first, last, before }: PageArgs): number {
  if (last != null || before != null) throw apiError('BAD_USER_INPUT', 'Only forward pagination (first/after) is supported')
  if (first == null) return DEFAULT_PAGE_SIZE
  if (first < 1 || first > MAX_PAGE_SIZE) {
    throw apiError('BAD_USER_INPUT', `first must be between 1 and ${MAX_PAGE_SIZE}`)
  }
  return first
}

/** Turns `limit + 1` fetched rows into a Relay connection. */
export function toConnection<T extends { createdAt: Date | string; id: string }>(rows: T[], limit: number, hadCursor: boolean): Connection<T> {
  const page = rows.slice(0, limit)
  const edges = page.map((node) => ({ cursor: encodeCursor(node), node }))
  return {
    edges,
    pageInfo: {
      hasNextPage: rows.length > limit,
      hasPreviousPage: hadCursor,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges.at(-1)?.cursor ?? null,
    },
  }
}
