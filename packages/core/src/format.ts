const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const monthDay = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
const monthDayYear = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' })

/** Compact timeline timestamp: "now", "8m", "3h", "2d", "Oct 4", "Oct 4, 2024". */
export function formatRelativeTime(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const diff = now.getTime() - date.getTime()
  if (diff < MINUTE) return 'now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`
  return date.getFullYear() === now.getFullYear() ? monthDay.format(date) : monthDayYear.format(date)
}

/** Long form for accessibility labels and detail views: "27 minutes ago". */
export function formatRelativeTimeLong(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const diff = now.getTime() - date.getTime()
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return unit(Math.floor(diff / MINUTE), 'minute')
  if (diff < DAY) return unit(Math.floor(diff / HOUR), 'hour')
  if (diff < 7 * DAY) return unit(Math.floor(diff / DAY), 'day')
  return monthDayYear.format(date)
}

/** 999 → "999", 1284 → "1.3K", 2_400_000 → "2.4M". */
export function formatCount(value: number): string {
  if (value < 1000) return String(value)
  const [divisor, suffix] = value < 1_000_000 ? [1000, 'K'] : [1_000_000, 'M']
  const scaled = value / divisor
  return `${scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10}${suffix}`
}

/** "Civic One Newsroom" → "CO", "maya" → "MA". */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
}
