import { coarsen, DEFAULT_CENTER, type GeoPoint } from '@civic/core'
import * as Location from 'expo-location'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { storage } from './storage'

interface LocationContextValue {
  point: GeoPoint
  source: 'default' | 'device'
  label: string
  locate: () => Promise<boolean>
  reset: () => Promise<void>
}

const KEY = 'civic.location.v1'
const LocationContext = createContext<LocationContextValue | null>(null)

export function useNear(): LocationContextValue {
  const value = useContext(LocationContext)
  if (!value) throw new Error('useNear must be used inside <LocationProvider>')
  return value
}

/**
 * The viewer's reference point for Nearby/Alerts. Always coarsened to ~1 km
 * before it leaves the device — and identical coarse points share cache keys.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<GeoPoint | null>(null)

  useEffect(() => {
    storage
      .get(KEY)
      .then((raw) => raw && setDevice(JSON.parse(raw) as GeoPoint))
      .catch(() => undefined)
  }, [])

  const locate = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (permission.status !== Location.PermissionStatus.GRANTED) return false
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    const point = coarsen({ lat: position.coords.latitude, lng: position.coords.longitude })
    setDevice(point)
    await storage.set(KEY, JSON.stringify(point))
    return true
  }, [])

  const reset = useCallback(async () => {
    setDevice(null)
    await storage.remove(KEY)
  }, [])

  const value = useMemo<LocationContextValue>(
    () => ({
      point: device ?? DEFAULT_CENTER,
      source: device ? 'device' : 'default',
      label: device ? 'Near you' : 'Metro area',
      locate,
      reset,
    }),
    [device, locate, reset],
  )

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}
