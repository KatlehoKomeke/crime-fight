import { profilePath } from '@/lib/profile'
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
    { key: 'notifications', label: 'Notifications', icon: 'bell', href: '/notifications', match: (p) => p.startsWith('/notifications'), phone: true },
    // Phones open Messages from the home header instead (MessagesButton): the tab bar is full.
    { key: 'messages', label: 'Messages', icon: 'mail', href: '/messages', match: (p) => p.startsWith('/messages') },
    { key: 'saved', label: 'Saved', icon: 'bookmark', href: '/saved', match: (p) => p.startsWith('/saved') },
    {
      key: 'profile',
      label: 'Profile',
      icon: 'profile',
      href: handle ? profilePath(handle) : '/sign-in',
      // Your profile and its follow lists.
      match: (p) => (handle ? p === profilePath(handle) || p.startsWith(`${profilePath(handle)}/`) : p === '/sign-in'),
      phone: true,
    },
    // Not in the phone tab bar (five tabs max); phones reach it from their own profile.
    { key: 'settings', label: 'Settings', icon: 'settings', href: '/settings', match: (p) => p.startsWith('/settings') },
  ]
}
