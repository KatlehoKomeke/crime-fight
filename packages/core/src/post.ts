export const POST_MAX_LENGTH = 500

export const POST_KINDS = ['UPDATE', 'ALERT', 'ADVISORY'] as const
export type PostKind = (typeof POST_KINDS)[number]

export const ALERT_SEVERITIES = ['INFO', 'ADVISORY', 'WARNING', 'CRITICAL'] as const
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number]

const HASHTAG = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]{2,40})/gu

/** Extracts up to five unique topics from `#Hashtags`; `label` keeps the author's casing for new topics. */
export function extractTopics(body: string): Array<{ slug: string; label: string }> {
  const topics = new Map<string, string>()
  for (const match of body.matchAll(HASHTAG)) {
    const label = match[2]!
    if (!topics.has(label.toLowerCase())) topics.set(label.toLowerCase(), label)
  }
  return [...topics].slice(0, 5).map(([slug, label]) => ({ slug, label }))
}

export type BodySegment =
  | { type: 'text'; text: string }
  | { type: 'hashtag'; text: string; slug: string }
  | { type: 'mention'; text: string; handle: string }
  | { type: 'link'; text: string; url: string }

const TOKEN = /(#[\p{L}\p{N}_]{2,40})|(@[A-Za-z0-9_]{2,30})|(https?:\/\/[^\s]+[^\s.,!?;:)])/gu

/** Splits a body into renderable segments so every client highlights the same way. */
export function segmentBody(body: string): BodySegment[] {
  const segments: BodySegment[] = []
  let last = 0
  for (const match of body.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > last) segments.push({ type: 'text', text: body.slice(last, index) })
    const [token, hashtag, mention, url] = match
    if (hashtag) segments.push({ type: 'hashtag', text: token, slug: hashtag.slice(1).toLowerCase() })
    else if (mention) segments.push({ type: 'mention', text: token, handle: mention.slice(1) })
    else if (url) segments.push({ type: 'link', text: token, url })
    last = index + token.length
  }
  if (last < body.length) segments.push({ type: 'text', text: body.slice(last) })
  return segments
}
