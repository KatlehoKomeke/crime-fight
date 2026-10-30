/**
 * Privacy guard for community posts. Runs on-device as the user types (no
 * network round trip) and again on the server, which is authoritative.
 *
 * `block` findings stop a post from publishing; `warn` findings are shown but
 * the author may proceed.
 */

export type PrivacyFindingKind = 'EMAIL' | 'PHONE' | 'NATIONAL_ID' | 'PAYMENT_CARD' | 'STREET_ADDRESS'

export interface PrivacyFinding {
  kind: PrivacyFindingKind
  level: 'block' | 'warn'
  start: number
  end: number
  message: string
}

interface Rule {
  kind: PrivacyFindingKind
  level: PrivacyFinding['level']
  pattern: RegExp
  message: string
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
    level: 'block',
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    message: 'Looks like a card number. Never post payment details.',
    validate: (m) => {
      const d = digitsOf(m)
      return d.length >= 13 && d.length <= 19 && d.length !== 13 && luhn(d)
    },
  },
  {
    kind: 'NATIONAL_ID',
    level: 'block',
    // South African ID: YYMMDD SSSS C A Z, Luhn-checked.
    pattern: /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{7}\b/g,
    message: 'Looks like an ID number. Remove it to protect the person involved.',
    validate: (m) => luhn(m),
  },
  {
    kind: 'EMAIL',
    level: 'warn',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    message: 'Email address detected. Only share contact details for official services.',
  },
  {
    kind: 'PHONE',
    level: 'warn',
    pattern: /(?<![\d+])(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s-]?\d{3}[\s-]?\d{3,4}(?!\d)/g,
    message: 'Phone number detected. Only share numbers for official services.',
    validate: (m) => {
      const d = digitsOf(m)
      return d.length >= 9 && d.length <= 13
    },
  },
  {
    kind: 'STREET_ADDRESS',
    level: 'warn',
    pattern: new RegExp(String.raw`\b\d{1,5}[A-Za-z]?\s+(?:[A-Z][a-z'-]+\s+){1,3}(?:${STREET_SUFFIXES})\b\.?`, 'g'),
    message: 'Exact address detected. Describe the area or nearest intersection instead.',
  },
]

export function checkPrivacy(text: string): PrivacyFinding[] {
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
      findings.push({ kind: rule.kind, level: rule.level, start, end, message: rule.message })
    }
  }
  return findings.sort((a, b) => a.start - b.start)
}

export const hasBlockingFinding = (findings: PrivacyFinding[]) => findings.some((f) => f.level === 'block')
