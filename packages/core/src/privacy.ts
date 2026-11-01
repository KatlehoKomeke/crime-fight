/**
 * Privacy guard for posts and direct messages. Runs on-device as the user
 * types (no network round trip) and flags personal data before it is shared.
 *
 * It warns and never blocks: the author decides. `danger` findings (ID and
 * card numbers) are shown more prominently than `warn` ones.
 */

export type PrivacyFindingKind = 'EMAIL' | 'PHONE' | 'NATIONAL_ID' | 'PAYMENT_CARD' | 'STREET_ADDRESS'

/** Where the text is going: a public post or a private message to one person. */
export type PrivacyAudience = 'public' | 'private'

export interface PrivacyFinding {
  kind: PrivacyFindingKind
  level: 'danger' | 'warn'
  start: number
  end: number
  message: string
}

interface Rule {
  kind: PrivacyFindingKind
  level: PrivacyFinding['level']
  pattern: RegExp
  message: Record<PrivacyAudience, string>
  validate?: (match: string) => boolean
}

const digitsOf = (value: string) => value.replace(/\D/g, '')

function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return sum % 10 === 0
}

// Street names must be capitalised ("14 Harbor Avenue") so prose like
// "3 cars on the road" is not mistaken for an address.
const STREET_SUFFIXES = [
  'Street', 'St', 'Road', 'Rd', 'Avenue', 'Ave', 'Drive', 'Dr', 'Lane', 'Ln', 'Crescent', 'Cres',
  'Close', 'Boulevard', 'Blvd', 'Way', 'Place', 'Pl', 'Court', 'Ct', 'Terrace',
].flatMap((suffix) => [suffix, suffix.toLowerCase()]).join('|')

const RULES: Rule[] = [
  {
    kind: 'PAYMENT_CARD',
    level: 'danger',
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    message: {
      public: 'Looks like a card number. Never post payment details.',
      private: 'Looks like a card number. Nobody genuine needs your card details in a message.',
    },
    validate: (m) => {
      const d = digitsOf(m)
      return d.length >= 13 && d.length <= 19 && d.length !== 13 && luhn(d)
    },
  },
  {
    kind: 'NATIONAL_ID',
    level: 'danger',
    // South African ID: YYMMDD SSSS C A Z, Luhn-checked.
    pattern: /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{7}\b/g,
    message: {
      public: 'Looks like an ID number. Remove it to protect the person involved.',
      private: 'Looks like an ID number. Only share it with someone you trust.',
    },
    validate: (m) => luhn(m),
  },
  {
    kind: 'EMAIL',
    level: 'warn',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    message: {
      public: 'Email address detected. Only share contact details for official services.',
      private: 'Email address. Only share it with someone you trust.',
    },
  },
  {
    kind: 'PHONE',
    level: 'warn',
    pattern: /(?<![\d+])(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s-]?\d{3}[\s-]?\d{3,4}(?!\d)/g,
    message: {
      public: 'Phone number detected. Only share numbers for official services.',
      private: 'Phone number. Only share it with someone you trust.',
    },
    validate: (m) => {
      const d = digitsOf(m)
      return d.length >= 9 && d.length <= 13
    },
  },
  {
    kind: 'STREET_ADDRESS',
    level: 'warn',
    pattern: new RegExp(String.raw`\b\d{1,5}[A-Za-z]?\s+(?:[A-Z][a-z'-]+\s+){1,3}(?:${STREET_SUFFIXES})\b\.?`, 'g'),
    message: {
      public: 'Exact address detected. Describe the area or nearest intersection instead.',
      private: 'Exact address. Only share it with someone you trust.',
    },
  },
]

export function checkPrivacy(text: string, audience: PrivacyAudience = 'public'): PrivacyFinding[] {
  const findings: PrivacyFinding[] = []
  const taken: Array<[number, number]> = []
  const overlaps = (start: number, end: number) => taken.some(([s, e]) => start < e && end > s)

  // Rules are ordered most-severe first so a card number is not also reported as a phone number.
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      const start = match.index ?? 0
      const end = start + match[0].length
      if (overlaps(start, end)) continue
      if (rule.validate && !rule.validate(match[0])) continue
      taken.push([start, end])
      findings.push({ kind: rule.kind, level: rule.level, start, end, message: rule.message[audience] })
    }
  }
  return findings.sort((a, b) => a.start - b.start)
}

