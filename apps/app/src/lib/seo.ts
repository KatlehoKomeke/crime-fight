import { PREVIEW_IMAGE, previewPageImage } from '@civic/core'
import type { Metadata } from 'expo-router/server'
import { serverConfig } from './config'

export const SITE_NAME = 'CIVIC/ONE'
export const SITE_DESCRIPTION = 'Verified local safety updates, official alerts, victim support and the people keeping your neighbourhood informed.'
/** Where the service runs; previews show this as the page's language and region. */
const LOCALE = 'en_ZA'

/** `<title>` format shared by server metadata and client-side navigation. */
export const documentTitle = (title: string) => (title === SITE_NAME ? `${SITE_NAME} — See clearly. Act safely.` : `${title} · ${SITE_NAME}`)

/** A link preview card the API draws (apps/api/src/og): its site path and what it shows. */
export interface PreviewImage {
  path: string
  alt: string
}

/**
 * Shared metadata defaults; every route overrides title/description/path.
 * Every page gets a 1200×630 preview card, the home page's unless it passes
 * its own. Social titles leave out the site name: previews show `og:site_name`.
 */
export function pageMetadata({ title, description = SITE_DESCRIPTION, path, type = 'website', image, article, noindex, extra }: {
  title: string
  description?: string
  path: string
  type?: 'website' | 'profile' | 'article'
  image?: PreviewImage | null
  article?: { publishedTime: string; authorPath: string; section?: string | null; tags?: string[] }
  noindex?: boolean
  extra?: Partial<Metadata>
}): Metadata {
  const site = serverConfig().siteUrl
  const url = `${site}${path}`
  const card = image ?? previewPageImage('home')
  const socialTitle = title === SITE_NAME ? documentTitle(title) : title
  return {
    title: documentTitle(title),
    description,
    applicationName: SITE_NAME,
    alternates: { canonical: url },
    // Lets search results show the card large.
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true, 'max-image-preview': 'large' },
    openGraph: {
      title: socialTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: LOCALE,
      type,
      images: [{ url: `${site}${card.path}`, alt: card.alt, ...PREVIEW_IMAGE }],
      ...(article
        ? { publishedTime: article.publishedTime, authors: [`${site}${article.authorPath}`], section: article.section ?? undefined, tags: article.tags }
        : {}),
    },
    twitter: { card: 'summary_large_image', title: socialTitle, description, images: [{ url: `${site}${card.path}`, alt: card.alt }] },
    ...extra,
  }
}

export const excerpt = (text: string, max = 155) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)
