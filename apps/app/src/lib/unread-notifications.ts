import { DEFAULT_RADIUS_KM } from '@civic/core'
import { usePathname } from 'expo-router'
import { useEffect, useSyncExternalStore } from 'react'
import { useQuery } from 'urql'
import { LatestNotificationQuery } from '@/graphql/documents'
import { useAuth } from './auth'
import { useNear } from './location'
import { storage } from './storage'

const KEY = 'civic.notifications-seen.v1'
/** Moving between pages re-checks for new notifications, at most this often. */
const RECHECK_MS = 30_000

/**
 * The newest notification each identity has had on screen on this device, as
 * its server createdAt, so the device's clock never matters. Kept on the device
 * rather than the account: signed-out visitors get the dot for new alerts too,
 * but each device clears its own.
 */
let seen: Record<string, string> | undefined
let loading: Promise<void> | undefined
/** Shared, so the rail and the tab bar (both mounted on the web) check once between them. */
let lastCheck = 0
const listeners = new Set<() => void>()

const emit = () => {
  for (const listener of listeners) listener()
}

function load() {
  loading ??= storage
    .get(KEY)
    .then((raw) => (raw ? (JSON.parse(raw) as Record<string, string>) : {}))
    .catch(() => ({}))
    .then((stored) => {
      seen = stored
      emit()
    })
  return loading
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  void load()
  return () => {
    listeners.delete(listener)
  }
}

async function markSeen(identity: string, createdAt: string) {
  await load()
  const last = seen?.[identity]
  if (last && Date.parse(last) >= Date.parse(createdAt)) return
  seen = { ...seen, [identity]: createdAt }
  emit()
  await storage.set(KEY, JSON.stringify(seen))
}

/** Whether Notifications has something newer than this device last showed there. */
export function useUnreadNotifications(): boolean {
  const { status, identity } = useAuth()
  const near = useNear()
  const pathname = usePathname()
  const seenBy = useSyncExternalStore(subscribe, () => seen, () => undefined)
  // Until the session is read we don't know whose notifications to check.
  const pause = status === 'loading'
  const [{ data }, reexecute] = useQuery({ query: LatestNotificationQuery, variables: { near: near.point, radiusKm: DEFAULT_RADIUS_KM }, pause })

  useEffect(() => {
    if (pause || Date.now() - lastCheck < RECHECK_MS) return
    // The first check is the query's own fetch; later page changes refresh it.
    if (lastCheck) reexecute({ requestPolicy: 'network-only' })
    lastCheck = Date.now()
    // `pathname` is the trigger: every page change may re-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, pause, reexecute])

  const latest = data?.latestNotificationAt
  if (!latest || !seenBy) return false
  const last = seenBy[identity]
  return !last || Date.parse(latest) > Date.parse(last)
}

/** Clears the dot up to the newest notification on screen. */
export function useMarkNotificationsSeen(newest: string | undefined) {
  const { status, identity } = useAuth()
  useEffect(() => {
    if (newest && status !== 'loading') void markSeen(identity, newest)
  }, [identity, newest, status])
}
