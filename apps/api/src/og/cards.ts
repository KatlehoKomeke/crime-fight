import { type AlertSeverity, initialsFor, type PostKind, PREVIEW_PAGES, type PreviewPage, previewPageImage, TRUST_BADGE_LABEL, trustBadgeFor } from '@civic/core'
import { type Database, type Post, schema, type Topic, type User } from '@civic/db'
import { and, count, eq, isNull } from 'drizzle-orm'
import type { Loaders } from '../data/loaders'

/*
 * Social preview cards (Open Graph / Twitter, 1200×630). A card is built only
 * from stored data, looked up by handle, id or slug, never from text in the
 * URL: nobody can mint an official-looking alert image under our domain.
 */

/** Bump when the artwork changes so every card's URL changes with it. */
const DESIGN = 1

export interface Person {
  handle: string
  name: string
  initials: string
  verified: boolean
  /** Verified non-members get the lime avatar, as in the app. */
  official: boolean
  badge: string | null
  avatarUrl: string | null
}

export interface ProfileCard extends Person {
  kind: 'profile'
  bio: string
  posts: number
  following: number
  followers: number
}

export interface PostCard {
  kind: 'post'
  id: string
  postKind: PostKind
  severity: AlertSeverity | null
  body: string
  area: string | null
  category: string | null
  createdAt: string
  replyTo: string | null
  author: Person
  photoUrl: string | null
}

export interface TopicCard {
  kind: 'topic'
  slug: string
  title: string
  category: string
  posts: number
}

export interface PageCard {
  kind: 'page'
  page: PreviewPage
}

export type Card = ProfileCard | PostCard | TopicCard | PageCard

export interface PreviewImage {
  /** Site path of the PNG, with a version that changes whenever the card does. */
  path: string
  alt: string
  version: string
}

const person = (user: User): Person => {
  const badge = trustBadgeFor(user.role, user.verifiedAt !== null)
  return {
    handle: user.handle,
    name: user.displayName,
    initials: initialsFor(user.displayName),
    verified: user.verifiedAt !== null,
    official: user.verifiedAt !== null && user.role !== 'MEMBER',
    badge: badge ? TRUST_BADGE_LABEL[badge] : null,
    avatarUrl: user.avatarUrl,
  }
}

export async function profileCard(user: User, loaders: Loaders): Promise<ProfileCard> {
  const [posts, following, followers] = await Promise.all([loaders.postCount.load(user.id), loaders.followingCount.load(user.id), loaders.followerCount.load(user.id)])
  return { kind: 'profile', ...person(user), bio: user.bio, posts, following, followers }
}

export async function postCard(post: Post, loaders: Loaders): Promise<PostCard | null> {
  const [author, media, parent] = await Promise.all([
    loaders.user.load(post.authorId),
    loaders.media.load(post.id),
    post.replyToId ? loaders.post.load(post.replyToId) : null,
  ])
  if (!author) return null
  const parentAuthor = parent ? await loaders.user.load(parent.authorId) : null
  return {
    kind: 'post',
    id: post.id,
    postKind: post.kind,
    severity: post.severity,
    body: post.body,
    area: post.area,
    category: post.category,
    createdAt: post.createdAt.toISOString(),
    replyTo: parentAuthor?.handle ?? null,
    author: person(author),
    photoUrl: media[0]?.url ?? null,
  }
}

export async function topicCard(db: Database, topic: Topic): Promise<TopicCard> {
  const { postTopics, posts } = schema
  const [row] = await db
    .select({ n: count() })
    .from(postTopics)
    .innerJoin(posts, eq(posts.id, postTopics.postId))
    .where(and(eq(postTopics.topicId, topic.id), isNull(posts.deletedAt)))
  return { kind: 'topic', slug: topic.slug, title: topic.title, category: topic.category, posts: Number(row?.n ?? 0) }
}

/** 32-bit FNV-1a, base 36: a short, stable fingerprint of what a card shows. */
function fingerprint(value: unknown): string {
  let hash = 0x811c9dc5
  for (const char of JSON.stringify(value)) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`

export const KIND_LABEL: Record<PostKind, string> = { UPDATE: 'Update', ALERT: 'Alert', ADVISORY: 'Advisory' }

/** Text a card's body shows: no emoji (the brand fonts have none) and no runs of whitespace. */
export const cardText = (text: string) =>
  text
    .replace(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

const quote = (text: string, max: number) => {
  const clean = cardText(text)
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

function describe(card: Card): { path: string; alt: string } {
  switch (card.kind) {
    case 'profile':
      return {
        path: `/og/profile/${card.handle}.png`,
        alt: `${card.name} (@${card.handle}) on CIVIC/ONE${card.badge ? `, ${card.badge.toLowerCase()}` : ''}: ${plural(card.posts, 'post')}, ${card.following.toLocaleString('en')} following, ${plural(card.followers, 'follower')}.`,
      }
    case 'post': {
      const kind = card.postKind === 'UPDATE' ? 'Update' : `${KIND_LABEL[card.postKind]}${card.severity ? ` (${card.severity.toLowerCase()})` : ''}`
      return { path: `/og/post/${card.id}.png`, alt: `${kind} from ${card.author.name} (@${card.author.handle}) on CIVIC/ONE: “${quote(card.body, 200)}”` }
    }
    case 'topic':
      return { path: `/og/topic/${card.slug}.png`, alt: `#${card.title} on CIVIC/ONE: ${plural(card.posts, 'post')} in ${card.category.toLowerCase()}.` }
    case 'page':
      return previewPageImage(card.page)
  }
}

export function previewImage(card: Card): PreviewImage {
  const version = fingerprint([DESIGN, card])
  const { path, alt } = describe(card)
  return { path: `${path}?v=${version}`, alt, version }
}

/** The card behind an `/og/<kind>/<key>.png` path, or null if there's nothing to show. */
export async function loadCard(db: Database, loaders: Loaders, kind: string, key: string): Promise<Card | null> {
  switch (kind) {
    case 'profile': {
      const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, key.toLowerCase()))
      return user ? profileCard(user, loaders) : null
    }
    case 'post': {
      const post = /^[0-9a-f-]{36}$/i.test(key) ? await loaders.post.load(key) : null
      return post ? postCard(post, loaders) : null
    }
    case 'topic': {
      const [topic] = await db.select().from(schema.topics).where(eq(schema.topics.slug, key.toLowerCase()))
      return topic ? topicCard(db, topic) : null
    }
    case 'page':
      return Object.hasOwn(PREVIEW_PAGES, key) ? { kind: 'page', page: key as PreviewPage } : null
    default:
      return null
  }
}
