import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename } from 'node:path'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { PREVIEW_IMAGE, PREVIEW_PAGES, type PreviewPage } from '@civic/core'
import satori from 'satori'
import assets from './assets.json' with { type: 'json' }
import { type Card, cardText, KIND_LABEL, type Person, type PostCard, type ProfileCard, type TopicCard } from './cards'

const { width: WIDTH, height: HEIGHT } = PREVIEW_IMAGE

/** The app's brand and light palette (apps/app/src/theme/palette.ts). */
const C = {
  ink: '#10110f',
  inkSoft: '#2b2d29',
  inkRaised: '#1f201d',
  paper: '#f7f7f2',
  white: '#ffffff',
  lime: '#dfff00',
  muted: '#62655e',
  mutedOnInk: '#b9bbb4',
  surfaceAlt: '#eff0e9',
  line: '#dedfd8',
  tint: '#eff6b6',
  tintText: '#465300',
  accentText: '#566500',
  danger: '#d63a27',
  warning: '#b45f00',
}
const DISPLAY = 'Space Grotesk'
const SANS = 'DM Sans'

const nodeRequire = createRequire(import.meta.url)

/** Deployed, the Og function's bundling copies these next to the handler; locally they come from node_modules. */
function asset(specifier: string): Promise<Buffer> {
  const bundled = new URL(`./${basename(specifier)}`, import.meta.url)
  return readFile(existsSync(bundled) ? bundled : nodeRequire.resolve(specifier))
}

let ready: Promise<Parameters<typeof satori>[1]['fonts']> | undefined

/** Loads the rasteriser and fonts once per container. */
function setup() {
  ready ??= (async () => {
    const [wasm, regular, medium, bold, displaySemibold, display] = await Promise.all(
      [assets.resvg, assets.regular, assets.medium, assets.bold, assets.displaySemibold, assets.display].map(asset),
    )
    await initWasm(wasm!)
    return [
      { name: SANS, data: regular!, weight: 400, style: 'normal' },
      { name: SANS, data: medium!, weight: 500, style: 'normal' },
      { name: SANS, data: bold!, weight: 700, style: 'normal' },
      { name: DISPLAY, data: displaySemibold!, weight: 600, style: 'normal' },
      { name: DISPLAY, data: display!, weight: 700, style: 'normal' },
    ]
  })()
  return ready
}

/* A tiny element builder: satori takes React-shaped objects, and the API has no React. */

type Style = Record<string, string | number>
interface El {
  type: string
  props: Record<string, unknown>
}
type Child = El | string | null | undefined | false

function h(type: string, props: Record<string, unknown>, ...children: Child[]): El {
  const kids = children.filter((child): child is El | string => Boolean(child))
  return { type, props: { ...props, children: kids.length === 1 ? kids[0] : kids } }
}
/** Every box is a border-box flex container unless it says otherwise (satori defaults to content-box, like browsers). */
const box = (style: Style, ...children: Child[]) => h('div', { style: { display: 'flex', boxSizing: 'border-box', ...style } }, ...children)
/** A run of text, optionally with inline images; `lineClamp` and `textWrap` only work on plain text. */
const text = (style: Style, ...content: Child[]) => h('div', { style: { display: 'block', boxSizing: 'border-box', ...style } }, ...content)

const shield = (size: number, color: string, width = 2.2) =>
  h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' }, h('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', stroke: color, strokeWidth: width, strokeLinejoin: 'round' }))

function lockup(onInk: boolean) {
  return box(
    { alignItems: 'center', gap: 14 },
    box({ width: 52, height: 52, borderRadius: 26, backgroundColor: onInk ? C.inkRaised : C.ink, alignItems: 'center', justifyContent: 'center' }, shield(28, C.lime)),
    text({ fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, letterSpacing: -0.5, color: onInk ? C.paper : C.ink }, 'CIVIC/ONE'),
  )
}

function label(content: string, colors: { fg: string; bg: string; border?: string }) {
  return text(
    {
      fontFamily: SANS,
      fontWeight: 700,
      fontSize: 20,
      letterSpacing: 2,
      color: colors.fg,
      backgroundColor: colors.bg,
      border: `2px solid ${colors.border ?? colors.bg}`,
      borderRadius: 999,
      padding: '8px 18px',
    },
    content.toUpperCase(),
  )
}

/** The verified tick, as an inline image so it follows the last word of a wrapped name. */
const verified = (size: number, style: Style = {}) =>
  h(
    'svg',
    { width: size, height: size, viewBox: '0 0 24 24', style: { flexShrink: 0, verticalAlign: 'middle', ...style } },
    h('circle', { cx: 12, cy: 12, r: 12, fill: C.ink }),
    h('path', { d: 'm7.2 12.2 3.1 3.1 6.5-6.6', fill: 'none', stroke: C.lime, strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
  )

function trustChip(content: string, size = 22) {
  return box(
    { alignItems: 'center', gap: 8, backgroundColor: C.tint, borderRadius: 999, padding: `${size * 0.36}px ${size * 0.8}px ${size * 0.36}px ${size * 0.55}px` },
    shield(size * 0.95, C.tintText, 2.6),
    text({ fontFamily: SANS, fontWeight: 700, fontSize: size, color: C.tintText }, content),
  )
}

function avatar(person: Person, size: number, photo: string | null) {
  if (photo) return h('img', { src: photo, width: size, height: size, style: { width: size, height: size, borderRadius: size / 2, objectFit: 'cover' } })
  return box(
    { width: size, height: size, borderRadius: size / 2, backgroundColor: person.official ? C.lime : C.ink, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    text({ fontFamily: SANS, fontWeight: 700, fontSize: Math.round(size * 0.34), color: person.official ? C.ink : C.white }, person.initials),
  )
}

/** The profile banner's slanted ink band, here on the right of a card. */
const stripe = (style: Style) => box({ position: 'absolute', top: -40, bottom: -40, transform: 'skewX(-18deg)', ...style })

const count = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n))

function stat(n: number, one: string, many = `${one}s`) {
  return box(
    { alignItems: 'baseline', gap: 10 },
    text({ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: C.ink }, count(n)),
    text({ fontFamily: SANS, fontWeight: 400, fontSize: 28, color: C.muted }, n === 1 ? one : many),
  )
}

/** Shrinks long text so it still fits its lines. */
const fit = (length: number, steps: Array<[number, number]>, smallest: number) => steps.find(([max]) => length <= max)?.[1] ?? smallest

function profile(card: ProfileCard, photo: string | null) {
  const panel = card.verified ? C.lime : C.surfaceAlt
  const bio = cardText(card.bio)
  const nameSize = fit(card.name.length, [[12, 76], [18, 64], [28, 52]], 42)
  // The banner sits right, with the avatar on its edge, like the profile page's banner and avatar.
  return box(
    { width: WIDTH, height: HEIGHT, backgroundColor: C.paper },
    box({ position: 'absolute', top: 0, right: 0, width: 330, height: HEIGHT, backgroundColor: panel, overflow: 'hidden' }, stripe({ right: -80, width: 210, backgroundColor: C.ink })),
    box(
      { position: 'absolute', left: 870 - 128, top: HEIGHT / 2 - 128, width: 256, height: 256, borderRadius: 128, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
      avatar(card, 232, photo),
    ),
    box(
      { flexDirection: 'column', justifyContent: 'space-between', width: 720, height: HEIGHT, padding: '60px 0 60px 72px' },
      lockup(false),
      box(
        { flexDirection: 'column' },
        text(
          { fontFamily: DISPLAY, fontWeight: 700, fontSize: nameSize, lineHeight: 1.06, letterSpacing: -1.5, color: C.ink },
          card.name,
          card.verified ? verified(Math.round(nameSize * 0.56), { marginLeft: Math.round(nameSize * 0.22) }) : null,
        ),
        box(
          { alignItems: 'center', gap: 16, marginTop: 14 },
          text({ fontFamily: SANS, fontWeight: 500, fontSize: 30, color: C.muted }, `@${card.handle}`),
          card.badge ? trustChip(card.badge) : null,
        ),
        bio ? text({ fontFamily: SANS, fontWeight: 400, fontSize: 28, lineHeight: 1.36, color: C.inkSoft, lineClamp: 3, marginTop: 24 }, bio) : null,
      ),
      box({ gap: 34 }, stat(card.posts, 'post'), stat(card.following, 'following', 'following'), stat(card.followers, 'follower')),
    ),
  )
}

const severityColor = (card: PostCard) => (card.severity === 'CRITICAL' || card.severity === 'WARNING' ? C.danger : card.severity === 'ADVISORY' || card.postKind === 'ADVISORY' ? C.warning : C.accentText)

/** In South African time, where the service runs: a card is cached, so it can't say "2h ago". */
const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(iso))
    .replace(',', ' ·')

function post(card: PostCard, photo: string | null, authorPhoto: string | null) {
  const alert = card.postKind !== 'UPDATE'
  const tone = severityColor(card)
  const body = cardText(card.body)
  const size = photo ? fit(body.length, [[60, 48], [110, 40], [170, 34]], 30) : fit(body.length, [[70, 58], [130, 48], [210, 40]], 34)
  const meta = [card.replyTo ? `Replying to @${card.replyTo}` : null, card.area, card.category, when(card.createdAt)].filter(Boolean).join('  ·  ')
  const kind = alert ? `${KIND_LABEL[card.postKind]}${card.severity ? ` · ${card.severity}` : ''}` : card.replyTo ? 'Reply' : 'Update'
  return box(
    { width: WIDTH, height: HEIGHT, backgroundColor: C.paper },
    // Alerts keep the app's coloured edge: red for warnings, amber for advisories.
    alert ? box({ position: 'absolute', left: 0, top: 0, width: 16, height: HEIGHT, backgroundColor: tone }) : null,
    photo ? null : stripe({ right: -150, width: 200, backgroundColor: C.ink }),
    box(
      { flexDirection: 'column', width: WIDTH, height: HEIGHT, padding: photo ? '60px 72px 56px 72px' : '60px 160px 56px 72px' },
      box(
        { justifyContent: 'space-between', alignItems: 'center' },
        lockup(false),
        alert ? label(kind, { fg: C.white, bg: tone }) : label(kind, { fg: C.ink, bg: 'transparent', border: C.ink }),
      ),
      box(
        { flexGrow: 1, gap: 48, marginTop: 40 },
        box(
          { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0 },
          box(
            { alignItems: 'center', gap: 18 },
            avatar(card.author, 76, authorPhoto),
            box(
              { flexDirection: 'column', gap: 6, flexShrink: 1 },
              text({ fontFamily: SANS, fontWeight: 700, fontSize: 32, color: C.ink }, card.author.name, card.author.verified ? verified(28, { marginLeft: 10 }) : null),
              box(
                { alignItems: 'center', gap: 12 },
                text({ fontFamily: SANS, fontWeight: 500, fontSize: 24, color: C.muted }, `@${card.author.handle}`),
                card.author.badge ? trustChip(card.author.badge, 18) : null,
              ),
            ),
          ),
          box({ flexGrow: 1, alignItems: 'center' }, text({ fontFamily: DISPLAY, fontWeight: 600, fontSize: size, lineHeight: 1.2, letterSpacing: -0.5, color: C.ink, lineClamp: 5, textWrap: 'pretty' }, body)),
          text({ fontFamily: SANS, fontWeight: 500, fontSize: 24, color: C.muted, lineClamp: 1 }, meta),
        ),
        photo
          ? h('img', { src: photo, width: 340, height: 340, style: { width: 340, height: 340, borderRadius: 28, objectFit: 'cover', alignSelf: 'center', flexShrink: 0 } })
          : null,
      ),
    ),
  )
}

function topic(card: TopicCard) {
  return box(
    { width: WIDTH, height: HEIGHT, backgroundColor: C.paper },
    stripe({ right: -40, width: 150, backgroundColor: C.lime }),
    stripe({ right: -190, width: 150, backgroundColor: C.ink }),
    box(
      { flexDirection: 'column', justifyContent: 'space-between', width: 980, height: HEIGHT, padding: '60px 0 64px 72px' },
      box({ justifyContent: 'space-between', alignItems: 'center' }, lockup(false), label('Topic', { fg: C.ink, bg: 'transparent', border: C.ink })),
      box(
        { flexDirection: 'column' },
        text({ fontFamily: SANS, fontWeight: 700, fontSize: 24, letterSpacing: 3, color: C.accentText }, card.category.toUpperCase()),
        text({ fontFamily: DISPLAY, fontWeight: 700, fontSize: fit(card.title.length, [[14, 112], [22, 88]], 68), lineHeight: 1.02, letterSpacing: -2.5, color: C.ink, lineClamp: 2, marginTop: 14 }, `#${card.title}`),
        box({ width: 120, height: 12, backgroundColor: C.lime, marginTop: 26, borderRadius: 6 }),
      ),
      box(
        { alignItems: 'baseline', gap: 14 },
        text({ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: C.ink }, `${count(card.posts)} ${card.posts === 1 ? 'post' : 'posts'}`),
        text({ fontFamily: SANS, fontWeight: 400, fontSize: 28, color: C.muted }, 'Verified local updates and community reports'),
      ),
    ),
  )
}

function page(key: PreviewPage) {
  const { title, description } = PREVIEW_PAGES[key]
  const heading =
    key === 'home'
      ? box(
          { flexDirection: 'column' },
          text({ fontFamily: DISPLAY, fontWeight: 700, fontSize: 104, lineHeight: 1, letterSpacing: -3, color: C.paper }, 'See clearly.'),
          text({ fontFamily: DISPLAY, fontWeight: 700, fontSize: 104, lineHeight: 1, letterSpacing: -3, color: C.lime }, 'Act safely.'),
        )
      : text({ fontFamily: DISPLAY, fontWeight: 700, fontSize: 104, lineHeight: 1, letterSpacing: -3, color: C.paper }, title)
  return box(
    { width: WIDTH, height: HEIGHT, backgroundColor: C.ink },
    stripe({ right: -30, width: 170, backgroundColor: C.lime }),
    stripe({ right: 168, width: 22, backgroundColor: C.inkRaised }),
    box(
      { flexDirection: 'column', justifyContent: 'space-between', width: 900, height: HEIGHT, padding: '60px 0 64px 72px' },
      lockup(true),
      heading,
      text({ fontFamily: SANS, fontWeight: 400, fontSize: 30, lineHeight: 1.4, color: C.mutedOnInk, lineClamp: 3, maxWidth: 760 }, description),
    ),
  )
}

/**
 * A remote image as a data URI, or null if it's slow, large or not an image.
 * Only https, and only for URLs already stored with a user or post.
 */
async function fetchImage(url: string | null): Promise<string | null> {
  if (!url?.startsWith('https://')) return null
  try {
    const res = await fetch(url, { headers: { accept: 'image/jpeg,image/png' }, signal: AbortSignal.timeout(2500) })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/^image\/(jpeg|png)/.test(type)) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    return bytes.length > 4_000_000 ? null : `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

async function layout(card: Card): Promise<El> {
  switch (card.kind) {
    case 'profile':
      return profile(card, await fetchImage(card.avatarUrl))
    case 'post': {
      const [photo, authorPhoto] = await Promise.all([fetchImage(card.photoUrl), fetchImage(card.author.avatarUrl)])
      return post(card, photo, authorPhoto)
    }
    case 'topic':
      return topic(card)
    case 'page':
      return page(card.page)
  }
}

/** The card as a PNG, PREVIEW_IMAGE in size. */
export async function renderCard(card: Card): Promise<Uint8Array<ArrayBuffer>> {
  const fonts = await setup()
  const svg = await satori((await layout(card)) as unknown as Parameters<typeof satori>[0], { width: WIDTH, height: HEIGHT, fonts })
  // WebAssembly memory isn't garbage-collected: free both, or a warm container leaks on every card.
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } })
  const image = resvg.render()
  try {
    // A copy out of WebAssembly memory, which `free()` releases.
    return new Uint8Array(image.asPng())
  } finally {
    image.free()
    resvg.free()
  }
}
