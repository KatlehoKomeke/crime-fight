/**
 * Trust is computed from an account's verified role, never typed by the
 * author, so a "verified update" label cannot be spoofed in post text.
 */

export const USER_ROLES = ['MEMBER', 'REPORTER', 'OFFICIAL', 'NEWSROOM', 'SUPPORT'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const TRUST_BADGES = ['VERIFIED_UPDATE', 'LOCAL_REPORTER', 'OFFICIAL_SOURCE', 'SUPPORT_SERVICE'] as const
export type TrustBadge = (typeof TRUST_BADGES)[number]

export function trustBadgeFor(role: UserRole, verified: boolean): TrustBadge | null {
  if (!verified) return null
  switch (role) {
    case 'NEWSROOM':
      return 'VERIFIED_UPDATE'
    case 'REPORTER':
      return 'LOCAL_REPORTER'
    case 'OFFICIAL':
      return 'OFFICIAL_SOURCE'
    case 'SUPPORT':
      return 'SUPPORT_SERVICE'
    case 'MEMBER':
      return null
  }
}

export const TRUST_BADGE_LABEL: Record<TrustBadge, string> = {
  VERIFIED_UPDATE: 'Verified update',
  LOCAL_REPORTER: 'Local reporter',
  OFFICIAL_SOURCE: 'Official source',
  SUPPORT_SERVICE: 'Support service',
}

/** Only verified officials and newsrooms may publish alerts and advisories. */
export function canPublishAlerts(role: UserRole, verified: boolean): boolean {
  return verified && (role === 'OFFICIAL' || role === 'NEWSROOM')
}
