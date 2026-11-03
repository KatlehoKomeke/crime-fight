type Role = 'MEMBER' | 'REPORTER' | 'OFFICIAL' | 'NEWSROOM' | 'SUPPORT'

export interface SeedUser {
  handle: string
  displayName: string
  role: Role
  verified: boolean
  bio: string
}

export interface SeedPost {
  key: string
  author: string
  minutesAgo: number
  body: string
  kind?: 'UPDATE' | 'ALERT' | 'ADVISORY'
  severity?: 'INFO' | 'ADVISORY' | 'WARNING' | 'CRITICAL'
  area?: string
  category?: string
  topics?: string[]
  media?: { url: string; alt: string; caption: string; width: number; height: number }
  replyTo?: string
  counts?: { likes: number; reposts: number; replies: number }
}

export const seedUsers: SeedUser[] = [
  { handle: 'civicone', displayName: 'Civic One Newsroom', role: 'NEWSROOM', verified: true, bio: 'Verified updates from the Civic One desk. Corrections are always posted in-thread.' },
  { handle: 'mayac_reports', displayName: 'Maya Chen', role: 'REPORTER', verified: true, bio: 'Local reporter covering transit, housing and neighbourhood safety on the Westside.' },
  { handle: 'metro_updates', displayName: 'Metro Police Updates', role: 'OFFICIAL', verified: true, bio: 'Official account. Not monitored 24/7 — in an emergency call 10111 or 112.' },
  { handle: 'jordan_o', displayName: 'Jordan Okafor', role: 'MEMBER', verified: false, bio: 'Night-shift nurse. Harbor Avenue regular.' },
  { handle: 'alexm', displayName: 'Alex Morgan', role: 'MEMBER', verified: false, bio: 'Neighbourhood watch volunteer, Woodstock.' },
  { handle: 'metrodesk', displayName: 'Metro Desk', role: 'NEWSROOM', verified: true, bio: 'City news, verified twice before it reaches you.' },
  { handle: 'cityalerts', displayName: 'City Alerts', role: 'OFFICIAL', verified: true, bio: 'Service disruptions, road closures and public advisories from the City.' },
  { handle: 'victimsupport', displayName: 'Victim Support', role: 'SUPPORT', verified: true, bio: 'Free, confidential support for anyone affected by crime. You are not alone.' },
  { handle: 'safewalk_west', displayName: 'Westside Safe-Walk', role: 'SUPPORT', verified: true, bio: 'Volunteer walking escorts between transit stops, 18:00–00:00 daily.' },
  { handle: 'thandi_m', displayName: 'Thandi Mokoena', role: 'MEMBER', verified: false, bio: 'Gardens resident. Usually on the 07:10 train.' },
  { handle: 'harbor_watch', displayName: 'Harbor Watch', role: 'MEMBER', verified: false, bio: 'Residents association for the Harbor Avenue blocks.' },
]

export const seedTopics = [
  { slug: 'centralstation', title: 'Central Station', category: 'Public safety' },
  { slug: 'safewalk', title: 'Westside safe-walk', category: 'Community' },
  { slug: 'lightingplan', title: 'Neighbourhood lighting plan', category: 'City Hall' },
  { slug: 'harboravenue', title: 'Harbor Avenue', category: 'Traffic' },
  { slug: 'scamalert', title: 'Impersonation scams', category: 'Public safety' },
]

export const seedPosts: SeedPost[] = [
  {
    key: 'transit',
    author: 'civicone',
    minutesAgo: 8,
    body: 'Transit service has resumed at Central Station following an earlier safety response. Expect residual delays through 18:30. No ongoing threat has been reported. #CentralStation',
    kind: 'ADVISORY',
    severity: 'INFO',
    area: 'Central District',
    category: 'Transit',
    topics: ['centralstation'],
    counts: { likes: 186, reposts: 61, replies: 24 },
  },
  {
    key: 'safewalk',
    author: 'mayac_reports',
    minutesAgo: 27,
    body: 'Community volunteers are extending the Westside safe-walk program to three additional transit stops this month. Registration opens tomorrow. #SafeWalk',
    area: 'Westside',
    topics: ['safewalk'],
    media: {
      url: 'https://images.unsplash.com/photo-1573004814905-55057414ebe2?auto=format&fit=crop&w=1200&q=80',
      alt: 'Traffic and lights along a city street at night',
      caption: 'Westside · 27 min ago',
      width: 1200,
      height: 800,
    },
    counts: { likes: 342, reposts: 78, replies: 18 },
  },
  {
    key: 'fraud',
    author: 'metro_updates',
    minutesAgo: 42,
    body: 'Fraud alert: residents are reporting calls from people impersonating public officials and requesting immediate payment. Government agencies will never demand payment by gift card or cryptocurrency. #ScamAlert',
    kind: 'ALERT',
    severity: 'WARNING',
    area: 'Citywide',
    category: 'Public advisory',
    topics: ['scamalert'],
    counts: { likes: 511, reposts: 219, replies: 39 },
  },
  {
    key: 'lighting',
    author: 'jordan_o',
    minutesAgo: 61,
    body: 'The new lighting along Harbor Avenue is finally on. The walk from the late bus feels completely different tonight. Small infrastructure changes matter. #HarborAvenue',
    topics: ['harboravenue'],
    counts: { likes: 203, reposts: 22, replies: 12 },
  },
  {
    key: 'council',
    author: 'cityalerts',
    minutesAgo: 95,
    body: 'Council will livestream tonight’s session on the neighbourhood lighting plan at 19:00. Residents can submit questions in advance via the ward office. #LightingPlan',
    kind: 'ADVISORY',
    severity: 'INFO',
    area: 'City Hall',
    category: 'Civic',
    topics: ['lightingplan'],
    counts: { likes: 88, reposts: 31, replies: 9 },
  },
  {
    key: 'roadclosure',
    author: 'cityalerts',
    minutesAgo: 130,
    body: 'Lower Main Road between Station Rd and Trill Rd is closed for emergency water-main repairs until 22:00. Use Liesbeek Parkway as an alternative. #Observatory',
    kind: 'ALERT',
    severity: 'ADVISORY',
    area: 'Observatory',
    category: 'Road closure',
    counts: { likes: 54, reposts: 40, replies: 6 },
  },
  {
    key: 'support',
    author: 'victimsupport',
    minutesAgo: 180,
    body: 'If you were affected by this afternoon’s incident at Central Station, our counsellors are available tonight. Free, confidential, no forms required. Reply or message us privately.',
    area: 'Central District',
    topics: ['centralstation'],
    counts: { likes: 140, reposts: 57, replies: 4 },
  },
  {
    key: 'woodstock',
    author: 'alexm',
    minutesAgo: 240,
    body: 'Woodstock watch walk is on for Saturday 10:00, meeting at the community hall. New volunteers welcome — bring water and comfortable shoes.',
    area: 'Woodstock',
    counts: { likes: 31, reposts: 5, replies: 3 },
  },
  {
    key: 'reply-transit-1',
    author: 'thandi_m',
    minutesAgo: 5,
    replyTo: 'transit',
    body: 'Can confirm trains are moving again on platform 4. Staff are directing people calmly.',
  },
  {
    key: 'reply-transit-2',
    author: 'metro_updates',
    minutesAgo: 3,
    replyTo: 'transit',
    body: 'Thank you. Officers remain on site as a precaution. Please give responders space near the north entrance.',
  },
  {
    key: 'reply-lighting-1',
    author: 'harbor_watch',
    minutesAgo: 50,
    replyTo: 'lighting',
    body: 'Two years of petitions. Thank you to everyone who came to the ward meetings.',
  },
]

const FILLER_BODIES: Array<[string, string, string?]> = [
  ['thandi_m', 'Morning train on time for once. Security presence at Gardens stop is reassuring.'],
  ['harbor_watch', 'Reminder: monthly residents meeting this Thursday. Agenda includes the new CCTV proposal. #HarborAvenue', 'harboravenue'],
  ['safewalk_west', 'Tonight’s safe-walk volunteers: 6 escorts on shift from 18:00. Look for the lime vests. #SafeWalk', 'safewalk'],
  ['metrodesk', 'Explainer: how verified alerts are reviewed before they reach your feed.'],
  ['jordan_o', 'Late bus driver waited for two of us running from the hospital. Kindness counts. #HarborAvenue', 'harboravenue'],
  ['mayac_reports', 'Spoke to stall owners at Central Station — trade is back to normal this evening. #CentralStation', 'centralstation'],
  ['alexm', 'Street light out on the corner by the hall again. Logged with the City — ref in thread. #LightingPlan', 'lightingplan'],
  ['victimsupport', 'You do not need to report to police to get support from us. Talk first, decide later.'],
  ['metrodesk', 'Scam calls are now spoofing local numbers. If in doubt, hang up and call the official line yourself. #ScamAlert', 'scamalert'],
  ['thandi_m', 'Does anyone know if the Gardens footbridge is open again? #SafeWalk', 'safewalk'],
]

/** Older filler posts so the feed has depth for pagination and trends have volume. */
export function fillerPosts(count = 40): SeedPost[] {
  return Array.from({ length: count }, (_, i) => {
    const [author, body, topic] = FILLER_BODIES[i % FILLER_BODIES.length]!
    return {
      key: `filler-${i}`,
      author,
      minutesAgo: 300 + i * 47,
      body,
      topics: topic ? [topic] : [],
      counts: { likes: (i * 37) % 120, reposts: (i * 13) % 30, replies: 0 },
    }
  })
}
