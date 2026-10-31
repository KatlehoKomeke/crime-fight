import type { IconName } from '../Icon'

export interface NavItem {
  key: string
  label: string
  icon: IconName
  href: string
  match: (pathname: string) => boolean
  phone?: boolean
}

export function navItems(handle: string | null): NavItem[] {
  return [
    { key: 'home', label: 'Home', icon: 'home', href: '/', match: (p) => p === '/', phone: true },
    { key: 'explore', label: 'Explore', icon: 'search', href: '/explore', match: (p) => p.startsWith('/explore') || p.startsWith('/topic'), phone: true },
    { key: 'map', label: 'Live radar', icon: 'radar', href: '/map', match: (p) => p.startsWith('/map'), phone: true },
    { key: 'alerts', label: 'Alerts', icon: 'bell', href: '/alerts', match: (p) => p.startsWith('/alerts'), phone: true },
    { key: 'saved', label: 'Saved', icon: 'bookmark', href: '/saved', match: (p) => p.startsWith('/saved') },
    {
      key: 'profile',
      label: 'Profile',
      icon: 'profile',
      href: handle ? `/u/${handle}` : '/sign-in',
      match: (p) => (handle ? p === `/u/${handle}` : p === '/sign-in'),
      phone: true,
    },
    // Not in the phone tab bar (five tabs max); phones reach it from their own profile.
    { key: 'settings', label: 'Settings', icon: 'settings', href: '/settings', match: (p) => p.startsWith('/settings') },
  ]
}
