import { z } from 'zod'

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export type GeoPoint = z.infer<typeof geoPointSchema>

/** Default metro centre until the viewer shares a location (Cape Town CBD). */
export const DEFAULT_CENTER: GeoPoint = { lat: -33.9249, lng: 18.4241 }
export const DEFAULT_RADIUS_KM = 15
export const MAX_RADIUS_KM = 100

const EARTH_RADIUS_KM = 6371

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`
}

/**
 * Coarsens a coordinate to roughly 1.1 km so a post's location shows the
 * neighbourhood, never the poster's doorstep.
 */
export function coarsen(point: GeoPoint, decimals = 2): GeoPoint {
  const factor = 10 ** decimals
  return { lat: Math.round(point.lat * factor) / factor, lng: Math.round(point.lng * factor) / factor }
}
