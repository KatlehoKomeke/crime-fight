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
