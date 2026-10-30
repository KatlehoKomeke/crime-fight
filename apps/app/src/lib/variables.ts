import { DEFAULT_RADIUS_KM, type GeoPoint } from '@civic/core'

export const PAGE_SIZE = 20

export type FeedKind = 'FOR_YOU' | 'NEARBY' | 'FOLLOWING'

/**
 * Single source of truth for query variables. Loaders (server) and screens
 * (client) must build byte-identical variables so the client reuses the
 * server-prefetched result instead of refetching it.
 */
export function feedVariables(kind: FeedKind, near: GeoPoint) {
  return kind === 'NEARBY' ? { kind, near, radiusKm: DEFAULT_RADIUS_KM, first: PAGE_SIZE } : { kind, first: PAGE_SIZE }
}

export function alertsVariables(near: GeoPoint) {
  return { near, radiusKm: DEFAULT_RADIUS_KM, first: PAGE_SIZE }
}

export const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''
