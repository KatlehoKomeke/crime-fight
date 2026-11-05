import { BOUNTY_KINDS, type BountyKind } from '@civic/core'

export const PAGE_SIZE = 20

export type FeedKind = 'FOR_YOU' | 'FOLLOWING'

/**
 * Single source of truth for query variables. Loaders (server) and screens
 * (client) must build byte-identical variables so the client reuses the
 * server-prefetched result instead of refetching it.
 */
export function feedVariables(kind: FeedKind) {
  return { kind, first: PAGE_SIZE }
}

export function notificationsVariables() {
  return { first: PAGE_SIZE }
}

export function followListVariables(handle: string) {
  return { handle, first: PAGE_SIZE }
}

export const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

/* Bounties. */

export type BoardTab = 'open' | 'honoured'

const isKind = (value: string): value is BountyKind => (BOUNTY_KINDS as readonly string[]).includes(value)

/** The board's filters live in the URL (`?tab=honoured&kind=PROPERTY`), so a link to a filtered board works and the loader sees them. */
export function boardFilters(params: { tab?: string | string[]; kind?: string | string[] }) {
  const kind = param(params.kind).toUpperCase()
  return { tab: (param(params.tab) === 'honoured' ? 'honoured' : 'open') as BoardTab, kind: isKind(kind) ? kind : null }
}

export function boardVariables({ tab, kind }: { tab: BoardTab; kind: BountyKind | null }) {
  return { kind, honoured: tab === 'honoured', first: PAGE_SIZE }
}

export function bountyVariables(id: string) {
  return { id }
}
