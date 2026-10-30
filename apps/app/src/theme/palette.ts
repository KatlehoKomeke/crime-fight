/** Brand tokens carried over from the original design: ink, paper, lime, coral. */
export const brand = {
  ink: '#10110f',
  paper: '#f7f7f2',
  lime: '#dfff00',
  coral: '#f4513e',
} as const

export interface Palette {
  /** Page background behind columns. */
  bg: string
  /** Primary reading surface (timeline, cards). */
  surface: string
  /** Hover, pressed, chips, input wells. */
  surfaceAlt: string
  text: string
  textMuted: string
  line: string
  lineSoft: string
  /** Primary action fill and its foreground. */
  primary: string
  onPrimary: string
  /** High-emphasis dark card (e.g. "Need help now?"). */
  inverse: string
  onInverse: string
  onInverseMuted: string
  accent: string
  onAccent: string
  /** Accessible accent for text/icons on light surfaces. */
  accentText: string
  accentTint: string
  accentTintText: string
  contextBg: string
  danger: string
  dangerTint: string
  warning: string
  warningTint: string
  info: string
  overlay: string
  headerBg: string
  focus: string
  /** Member avatars stay neutral so lime remains a signal for verified sources. */
  avatar: string
  onAvatar: string
  verifiedBg: string
  verifiedFg: string
}

export const light: Palette = {
  bg: brand.paper,
  surface: '#ffffff',
  surfaceAlt: '#eff0e9',
  text: brand.ink,
  textMuted: '#62655e',
  line: '#dedfd8',
  lineSoft: '#eff0e9',
  primary: brand.ink,
  onPrimary: '#ffffff',
  inverse: brand.ink,
  onInverse: '#ffffff',
  onInverseMuted: '#b9bbb4',
  accent: brand.lime,
  onAccent: brand.ink,
  accentText: '#566500',
  accentTint: '#eff6b6',
  accentTintText: '#465300',
  contextBg: '#f8f9e8',
  danger: '#d63a27',
  dangerTint: 'rgba(244, 81, 62, 0.14)',
  warning: '#b45f00',
  warningTint: '#fff1dc',
  info: '#2f5bd3',
  overlay: 'rgba(16, 17, 15, 0.72)',
  headerBg: 'rgba(255, 255, 255, 0.88)',
  focus: brand.ink,
  avatar: brand.ink,
  onAvatar: '#ffffff',
  verifiedBg: brand.ink,
  verifiedFg: brand.lime,
}

export const dark: Palette = {
  bg: '#0b0c0a',
  surface: '#121311',
  surfaceAlt: '#1d1f1b',
  text: '#f2f3ec',
  textMuted: '#9fa298',
  line: '#2a2c27',
  lineSoft: '#1d1f1b',
  primary: brand.lime,
  onPrimary: brand.ink,
  inverse: '#1a1c17',
  onInverse: '#f2f3ec',
  onInverseMuted: '#a7aa9f',
  accent: brand.lime,
  onAccent: brand.ink,
  accentText: '#d4f200',
  accentTint: '#2b3200',
  accentTintText: '#e6ff4d',
  contextBg: '#161a0c',
  danger: '#ff6a55',
  dangerTint: 'rgba(255, 106, 85, 0.16)',
  warning: '#ffad4d',
  warningTint: '#2e2210',
  info: '#8ab0ff',
  overlay: 'rgba(0, 0, 0, 0.72)',
  headerBg: 'rgba(18, 19, 17, 0.86)',
  focus: brand.lime,
  avatar: '#2c2e29',
  onAvatar: '#f2f3ec',
  verifiedBg: brand.lime,
  verifiedFg: brand.ink,
}

export type ColorName = keyof Palette
