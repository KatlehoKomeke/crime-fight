import type { Metadata } from 'expo-router/server'
import { serverConfig } from './config'

export const SITE_NAME = 'CIVIC/ONE'
export const SITE_DESCRIPTION = 'Verified local safety updates, official alerts, victim support and the people keeping your neighbourhood informed.'

/** `<title>` format shared by server metadata and client-side navigation. */
export const documentTitle = (title: string) => (title === SITE_NAME ? `${SITE_NAME} — See clearly. Act safely.` : `${title} · ${SITE_NAME}`)

/** Shared metadata defaults; every route overrides title/description/path. */
export function pageMetadata({ title, description = SITE_DESCRIPTION, path, type = 'website', image, publishedTime, noindex, extra }: {
  title: string
  description?: string
  path: string
  type?: string
  image?: string | null
  publishedTime?: string
  noindex?: boolean
  extra?: Partial<Metadata>
}): Metadata {
  const url = `${serverConfig().siteUrl}${path}`
  const fullTitle = documentTitle(title)
  return {
    title: fullTitle,
    description,
    applicationName: SITE_NAME,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { title: fullTitle, description, url, siteName: SITE_NAME, type, publishedTime, ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: fullTitle, description },
    ...extra,
  }
}

export const excerpt = (text: string, max = 155) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)
