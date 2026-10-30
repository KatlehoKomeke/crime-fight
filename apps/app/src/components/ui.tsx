import { TRUST_BADGE_LABEL, type TrustBadge } from '@civic/core'
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native'
import { type ColorName, fonts, type Palette, radius, useColors } from '@/theme'
import { Icon, type IconName } from './Icon'

const variants = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.6, lineHeight: 26 },
  title: { fontFamily: fonts.displaySemibold, fontSize: 18, letterSpacing: -0.4, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 16 },
  micro: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.9, lineHeight: 14, textTransform: 'uppercase' },
})

export type TxtVariant = keyof typeof variants

export function Txt({ variant = 'body', color = 'text', style, ...props }: TextProps & { variant?: TxtVariant; color?: ColorName }) {
  const c = useColors()
  return <Text {...props} style={[variants[variant], { color: c[color] }, style]} />
}

/** Pressable with hover/press feedback on every platform. */
export function Touchable({
  style,
  hoverStyle,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; hoverStyle?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Pressable {...props} style={({ hovered, pressed }) => [style, (hovered || pressed) && hoverStyle, pressed && { opacity: 0.86 }]}>
      {children}
    </Pressable>
  )
}

type ButtonTone = 'primary' | 'accent' | 'outline' | 'ghost'

export function Button({
  label,
  onPress,
  tone = 'primary',
  icon,
  disabled,
  loading,
  size = 'md',
  style,
  accessibilityLabel,
}: {
  label: string
  onPress?: () => void
  tone?: ButtonTone
  icon?: IconName
  disabled?: boolean
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}) {
  const c = useColors()
  const tones: Record<ButtonTone, { bg: string; fg: string; border: string; hover: string }> = {
    primary: { bg: c.primary, fg: c.onPrimary, border: c.primary, hover: c.primary },
    accent: { bg: c.accent, fg: c.onAccent, border: c.accent, hover: c.accent },
    outline: { bg: 'transparent', fg: c.text, border: c.line, hover: c.surfaceAlt },
    ghost: { bg: 'transparent', fg: c.accentText, border: 'transparent', hover: c.surfaceAlt },
  }
  const t = tones[tone]
  const pad = { sm: { h: 32, px: 14, fs: 12 }, md: { h: 40, px: 18, fs: 13 }, lg: { h: 50, px: 22, fs: 15 } }[size]
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        styles.button,
        { backgroundColor: t.bg, borderColor: t.border, height: pad.h, paddingHorizontal: pad.px },
        (disabled || loading) && { opacity: 0.35 },
        style,
      ]}
      hoverStyle={{ backgroundColor: t.hover, transform: Platform.OS === 'web' ? [{ translateY: -1 }] : undefined }}
    >
      {loading ? <ActivityIndicator size="small" color={t.fg} /> : icon ? <Icon name={icon} size={pad.fs + 5} color={t.fg} /> : null}
      <Text style={[styles.buttonLabel, { color: t.fg, fontSize: pad.fs }]}>{label}</Text>
    </Touchable>
  )
}

export function IconButton({
  icon,
  label,
  onPress,
  color,
  size = 20,
  active,
  filled,
  style,
}: {
  icon: IconName
  label: string
  onPress?: () => void
  color?: string
  size?: number
  active?: boolean
  filled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const c = useColors()
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={6}
      style={[styles.iconButton, style]}
      hoverStyle={{ backgroundColor: c.surfaceAlt }}
    >
      <Icon name={icon} size={size} color={color ?? c.text} filled={filled} />
    </Touchable>
  )
}

export function Avatar({
  initials,
  url,
  size = 44,
  official = false,
  label,
}: {
  initials: string
  url?: string | null
  size?: number
  official?: boolean
  label?: string
}) {
  const c = useColors()
  const base = { width: size, height: size, borderRadius: size / 2 }
  if (url) return <Image source={url} style={base} accessibilityLabel={label} contentFit="cover" transition={150} />
  return (
    <View accessibilityLabel={label} style={[styles.avatar, base, { backgroundColor: official ? c.accent : c.avatar }]}>
      <Text style={[styles.avatarText, { color: official ? c.onAccent : c.onAvatar, fontSize: Math.max(10, size * 0.27) }]}>{initials}</Text>
    </View>
  )
}

export function VerifiedBadge({ size = 16 }: { size?: number }) {
  const c = useColors()
  return (
    <View accessibilityLabel="Verified account" style={[styles.verified, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.verifiedBg }]}>
      <Icon name="check" size={size * 0.75} color={c.verifiedFg} />
    </View>
  )
}

export function TrustChip({ badge }: { badge: TrustBadge }) {
  const c = useColors()
  return (
    <View style={[styles.chip, { backgroundColor: c.accentTint }]}>
      <Icon name="shield" size={12} color={c.accentTintText} />
      <Txt variant="micro" style={{ color: c.accentTintText }}>
        {TRUST_BADGE_LABEL[badge]}
      </Txt>
    </View>
  )
}

export function Card({ children, style, tone = 'surface' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'surface' | 'inverse' }) {
  const c = useColors()
  return (
    <View style={[styles.card, { backgroundColor: tone === 'inverse' ? c.inverse : c.surface, borderColor: tone === 'inverse' ? c.inverse : c.line }, style]}>
      {children}
    </View>
  )
}

export function Skeleton({ width, height = 12, style }: { width: number | `${number}%`; height?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors()
  return <View dataSet={{ skeleton: true }} style={[{ width, height, borderRadius: 6, backgroundColor: c.surfaceAlt }, style]} />
}

export function PostSkeleton() {
  const c = useColors()
  return (
    <View style={[styles.skeletonRow, { borderBottomColor: c.line }]} accessibilityElementsHidden>
      <Skeleton width={44} height={44} style={{ borderRadius: 22 }} />
      <View style={{ flex: 1, gap: 10 }}>
        <Skeleton width="45%" />
        <Skeleton width="95%" />
        <Skeleton width="80%" />
      </View>
    </View>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  const c = useColors()
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.accentTint }]}>
        <Icon name={icon} size={24} color={c.accentTintText} />
      </View>
      <Txt variant="title" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      <Txt variant="small" color="textMuted" style={{ textAlign: 'center', maxWidth: 340 }}>
        {body}
      </Txt>
      {action}
    </View>
  )
}

export const textStyles = variants as Record<TxtVariant, TextStyle>
export type { Palette }

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, borderWidth: 1 },
  buttonLabel: { fontFamily: fonts.bold },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontFamily: fonts.display, letterSpacing: -0.3 },
  verified: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.sm },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  skeletonRow: { flexDirection: 'row', gap: 12, padding: 18, borderBottomWidth: 1 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 56, paddingHorizontal: 24 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
})
