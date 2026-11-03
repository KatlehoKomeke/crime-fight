import { describe, expect, it } from 'vitest'
import { checkPrivacy, extractTopics, formatCount, formatRelativeTime, initialsFor, segmentBody, trustBadgeFor } from './index'
import { createPostSchema } from './schemas'

describe('privacy', () => {
  it('flags Luhn-valid ID numbers and card numbers as dangerous', () => {
    const findings = checkPrivacy('Suspect ID 8001015009087, paid with 4111 1111 1111 1111')
    expect(findings.map((f) => [f.kind, f.level])).toEqual([
      ['NATIONAL_ID', 'danger'],
      ['PAYMENT_CARD', 'danger'],
    ])
  })

  it('words findings for private messages differently from public posts', () => {
    const [post] = checkPrivacy('My ID is 8001015009087')
    const [message] = checkPrivacy('My ID is 8001015009087', 'private')
    expect(post?.message).toMatch(/Remove it/)
    expect(message?.message).toMatch(/someone you trust/)
  })

  it('ignores 13-digit strings that fail the ID checksum', () => {
    expect(checkPrivacy('Case 8001015009088 closed')).toEqual([])
  })

  it('warns on phone numbers, emails and exact addresses', () => {
    const text = 'Call 082 555 1234 or mail tips@example.com — it happened at 14 Harbor Avenue'
    const kinds = checkPrivacy(text).map((f) => f.kind)
    expect(kinds).toEqual(['PHONE', 'EMAIL', 'STREET_ADDRESS'])
    expect(checkPrivacy(text).every((f) => f.level === 'warn')).toBe(true)
  })

  it('leaves ordinary civic updates alone', () => {
    expect(checkPrivacy('Transit resumed at Central Station. Expect delays through 18:30.')).toEqual([])
    expect(checkPrivacy('Saw 3 cars on the road near the 2 schools')).toEqual([])
  })
})

describe('posts', () => {
  it('trims and validates bodies', () => {
    expect(createPostSchema.parse({ body: '  hello  ' }).body).toBe('hello')
    expect(createPostSchema.safeParse({ body: '   ' }).success).toBe(false)
  })

  it('requires a severity for alerts', () => {
    expect(createPostSchema.safeParse({ body: 'Road closed', kind: 'ALERT' }).success).toBe(false)
    expect(createPostSchema.safeParse({ body: 'Road closed', kind: 'ALERT', severity: 'WARNING' }).success).toBe(true)
  })

  it('extracts unique topics and segments bodies', () => {
    expect(extractTopics('Lights on #HarborAvenue! #harboravenue #SafeWalk')).toEqual([
      { slug: 'harboravenue', label: 'HarborAvenue' },
      { slug: 'safewalk', label: 'SafeWalk' },
    ])
    expect(segmentBody('Ask @metro_updates about #SafeWalk https://example.org/x.')).toEqual([
      { type: 'text', text: 'Ask ' },
      { type: 'mention', text: '@metro_updates', handle: 'metro_updates' },
      { type: 'text', text: ' about ' },
      { type: 'hashtag', text: '#SafeWalk', slug: 'safewalk' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'https://example.org/x', url: 'https://example.org/x' },
      { type: 'text', text: '.' },
    ])
  })
})

describe('format', () => {
  const now = new Date('2026-10-29T12:00:00Z')
  it('formats relative time compactly', () => {
    expect(formatRelativeTime(new Date('2026-10-29T11:52:00Z'), now)).toBe('8m')
    expect(formatRelativeTime(new Date('2026-10-29T09:00:00Z'), now)).toBe('3h')
    expect(formatRelativeTime(new Date('2025-01-02T09:00:00Z'), now)).toBe('Jan 2, 2025')
  })

  it('formats counts and initials', () => {
    expect([formatCount(186), formatCount(1284), formatCount(2_400_000)]).toEqual(['186', '1.3K', '2.4M'])
    expect([initialsFor('Civic One Newsroom'), initialsFor('maya')]).toEqual(['CN', 'MA'])
  })
})

describe('trust', () => {
  it('derives badges only for verified accounts', () => {
    expect(trustBadgeFor('OFFICIAL', true)).toBe('OFFICIAL_SOURCE')
    expect(trustBadgeFor('OFFICIAL', false)).toBeNull()
    expect(trustBadgeFor('MEMBER', true)).toBeNull()
  })
})
