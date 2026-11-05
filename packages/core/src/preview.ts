/**
 * Pages with no stored record behind them, as their link preview cards show
 * them. The API draws the cards (apps/api/src/og); the app describes them in
 * each page's metadata.
 */
export const PREVIEW_PAGES = {
  home: { title: 'See clearly. Act safely.', description: 'Verified local safety updates, official alerts and support from the people keeping your neighbourhood informed.' },
  explore: { title: 'Explore', description: 'Search verified local updates, topics and the trusted sources behind them.' },
  terms: { title: 'Terms of use', description: 'The rules for using CIVIC/ONE, and what you and we agree to.' },
  privacy: { title: 'Privacy policy', description: 'What CIVIC/ONE collects, why, who can see it and the choices you have.' },
  bounties: { title: 'Bounties', description: 'Rewards for recoveries, safe returns and information to SAPS, held by CIVIC/ONE until they are honoured.' },
  bountyRules: { title: 'How bounties work', description: 'What a bounty can be for, how it is paid, and what happens if it isn’t.' },
} as const

export type PreviewPage = keyof typeof PREVIEW_PAGES

/** Link preview cards are 1200×630 PNGs, the size every major platform shows large. */
export const PREVIEW_IMAGE = { width: 1200, height: 630, type: 'image/png' } as const

export function previewPageImage(page: PreviewPage): { path: string; alt: string } {
  const { title, description } = PREVIEW_PAGES[page]
  return { path: `/og/page/${page}.png`, alt: page === 'home' ? `CIVIC/ONE: ${title}` : `CIVIC/ONE: ${title}. ${description}` }
}
