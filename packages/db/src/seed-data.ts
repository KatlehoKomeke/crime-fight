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

export interface SeedBounty {
  poster: string
  kind: 'PROPERTY' | 'MISSING_PERSON' | 'INFORMATION'
  status: 'PENDING_PAYMENT' | 'PENDING_REVIEW' | 'OPEN' | 'PAID'
  title: string
  body: string
  area?: string
  sapsCaseNumber?: string
  relationship?: string
  amountCents: number
  durationDays: number
  fundedMinutesAgo: number
  closedMinutesAgo?: number
  claims?: Array<{ claimant: string; status: 'SUBMITTED' | 'PAID'; body: string; minutesAgo: number }>
}

/** Bounties in every state the board shows, plus one for the admin queue. */
export const seedBounties: SeedBounty[] = [
  {
    poster: 'jordan_o',
    kind: 'PROPERTY',
    status: 'OPEN',
    title: 'Silver 2016 Toyota Corolla, CA 442-118, taken from Albert Road',
    body: 'Taken from outside the community hall on Albert Road between 19:00 and 21:30 on Monday. Silver, small dent on the rear left door, child seat in the back. Reported to Woodstock SAPS. The reward is for the car coming back through SAPS, whatever state it is in.',
    area: 'Woodstock',
    sapsCaseNumber: 'CAS 212/11/2026',
    amountCents: 500000,
    durationDays: 60,
    fundedMinutesAgo: 60 * 24 * 2,
  },
  {
    poster: 'harbor_watch',
    kind: 'INFORMATION',
    status: 'OPEN',
    title: 'Information on the Harbor Avenue camera vandalism',
    body: 'Three of the residents’ association cameras on Harbor Avenue were cut down on the night of 28 October. We want information that helps SAPS make an arrest, given to the Harbor Avenue station first, not to us. Please do not approach anyone.',
    area: 'Harbor Avenue',
    sapsCaseNumber: 'CAS 88/10/2026',
    amountCents: 200000,
    durationDays: 90,
    fundedMinutesAgo: 60 * 24 * 5,
    claims: [
      {
        claimant: 'jordan_o',
        status: 'SUBMITTED',
        body: 'I gave a statement at Harbor Avenue SAPS on 2 November about a van I saw parked under the cameras that night, with its registration. The officer was Sgt Dlamini and it was added to the case. I have the receipt for the statement.',
        minutesAgo: 60 * 24 * 1,
      },
    ],
  },
  {
    poster: 'thandi_m',
    kind: 'PROPERTY',
    status: 'PAID',
    title: 'Black Giant hybrid bicycle taken from the Gardens station rack',
    body: 'Locked at the Gardens station rack on 20 October, gone by 18:00. Black Giant Escape with a brown saddle and a child seat mount. Reported at Gardens SAPS.',
    area: 'Gardens',
    amountCents: 80000,
    durationDays: 30,
    fundedMinutesAgo: 60 * 24 * 14,
    closedMinutesAgo: 60 * 24 * 3,
    claims: [
      {
        claimant: 'jordan_o',
        status: 'PAID',
        body: 'Saw it chained outside a flat on Mill Street with the child seat mount still on. Called Gardens SAPS, who collected it and matched the frame number; Thandi collected it from the station the next day.',
        minutesAgo: 60 * 24 * 7,
      },
    ],
  },
  {
    poster: 'thandi_m',
    kind: 'MISSING_PERSON',
    status: 'PENDING_REVIEW',
    title: 'Missing: my brother Lwazi, 29, last seen in Observatory on 3 November',
    body: 'Lwazi left home on Sunday afternoon and hasn’t been in touch since. He was wearing a grey hoodie and black jeans. Reported to Woodstock SAPS. If you see him, call 10111 with the case number; please don’t post where he is.',
    area: 'Observatory',
    sapsCaseNumber: 'CAS 230/11/2026',
    relationship: 'Brother',
    amountCents: 300000,
    durationDays: 30,
    fundedMinutesAgo: 60 * 6,
  },
]
