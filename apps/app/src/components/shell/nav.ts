import { profilePath } from '@/lib/profile'
import type { IconName } from '../Icon'

export interface NavItem {
  key: string
  label: string
  icon: IconName
  href: string
  match: (pathname: string) => boolean
}

/** The two halves of the app: neighbourhood updates, and the bounty board. */
export type Section = 'updates' | 'bounties'

/** Which half a path belongs to. The URL is the mode, so nothing is persisted and history remembers it. */
export const sectionOf = (pathname: string): Section => (pathname === '/bounties' || pathname.startsWith('/bounties/') ? 'bounties' : 'updates')

const notifications: NavItem = { key: 'notifications', label: 'Notifications', icon: 'bell', href: '/notifications', match: (p) => p.startsWith('/notifications') }
// Phones open Messages from the home header instead (MessagesButton): the tab bar is full.
const messages: NavItem = { key: 'messages', label: 'Messages', icon: 'mail', href: '/messages', match: (p) => p.startsWith('/messages') }
// Not in the phone tab bar (five tabs max); phones reach it from their own profile.
const settings: NavItem = { key: 'settings', label: 'Settings', icon: 'settings', href: '/settings', match: (p) => p.startsWith('/settings') }
const home: NavItem = { key: 'home', label: 'Home', icon: 'home', href: '/', match: (p) => p === '/' }
const explore: NavItem = { key: 'explore', label: 'Explore', icon: 'search', href: '/explore', match: (p) => p.startsWith('/explore') || p.startsWith('/topic') }
const saved: NavItem = { key: 'saved', label: 'Saved', icon: 'bookmark', href: '/saved', match: (p) => p.startsWith('/saved') }
const bounties: NavItem = { key: 'bounties', label: 'Bounties', icon: 'bounty', href: '/bounties', match: (p) => sectionOf(p) === 'bounties' }
const board: NavItem = {
  key: 'board',
  label: 'Bounties',
  icon: 'bounty',
  href: '/bounties',
  match: (p) => sectionOf(p) === 'bounties' && !p.startsWith('/bounties/mine') && !p.startsWith('/bounties/review'),
}
const mine: NavItem = { key: 'mine', label: 'My bounties', icon: 'bookmark', href: '/bounties/mine', match: (p) => p.startsWith('/bounties/mine') }
const review: NavItem = { key: 'review', label: 'Review', icon: 'shield', href: '/bounties/review', match: (p) => p.startsWith('/bounties/review') }

const profile = (handle: string | null): NavItem => ({
  key: 'profile',
  label: 'Profile',
  icon: 'profile',
  href: handle ? profilePath(handle) : '/sign-in',
  // Your profile and its lists.
  match: (p) => (handle ? p === profilePath(handle) || p.startsWith(`${profilePath(handle)}/`) : p === '/sign-in'),
})

/** The side rail: the section's own pages first, then what both sections share. */
export function railItems(handle: string | null, section: Section, isAdmin = false): NavItem[] {
  return section === 'bounties'
    ? [board, mine, ...(isAdmin ? [review] : []), notifications, messages, profile(handle), settings]
    : [home, explore, notifications, messages, saved, profile(handle), settings]
}

/** The phone tab bar is the same in both sections: Bounties takes the fourth of five slots. */
export function phoneTabs(handle: string | null): NavItem[] {
  return [home, explore, notifications, bounties, profile(handle)]
}
