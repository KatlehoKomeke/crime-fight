/**
 * Web: localStorage, guarded because it throws in some private modes.
 * Hardening path: move the refresh token to an httpOnly cookie set by the SSR
 * server so script cannot read it.
 */
const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const storage = {
  get: (key: string) => Promise.resolve(safe(() => window.localStorage.getItem(key), null)),
  set: (key: string, value: string) => Promise.resolve(safe(() => window.localStorage.setItem(key, value), undefined)),
  remove: (key: string) => Promise.resolve(safe(() => window.localStorage.removeItem(key), undefined)),
}
