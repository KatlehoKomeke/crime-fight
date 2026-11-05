import type { Database } from '@civic/db'
import { createLoaders } from '../data/loaders'
import { loadCard, previewImage } from './cards'
import { renderCard } from './render'

const PATH = /^\/og\/(profile|post|topic|page|bounty)\/([^/]+)\.png$/

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=60' } })

/**
 * `/og/<kind>/<key>.png?v=<version>`: a card's PNG. A profile, post or topic
 * is only drawn at its current version, which is then cached for good (the
 * version changes with the card). Any other version, or none, redirects to the
 * current one, so made-up versions can't make us draw the same card again.
 * Page cards have no data behind them and are drawn either way.
 */
export async function serveOg(db: Database, url: URL): Promise<Response> {
  const match = PATH.exec(url.pathname)
  let key: string
  try {
    key = decodeURIComponent(match?.[2] ?? '')
  } catch {
    return notFound()
  }
  const card = match ? await loadCard(db, createLoaders(db, async () => null), match[1]!, key) : null
  if (!card) return notFound()

  const image = previewImage(card)
  const current = url.searchParams.get('v') === image.version
  if (!current && card.kind !== 'page') {
    return new Response(null, { status: 302, headers: { location: image.path, 'cache-control': 'public, max-age=300' } })
  }
  return new Response(await renderCard(card), {
    // A bounty can be taken down; its card isn't kept for a year like a profile's.
    headers: { 'content-type': 'image/png', 'cache-control': current && card.kind !== 'bounty' ? 'public, max-age=31536000, immutable' : 'public, max-age=86400' },
  })
}
