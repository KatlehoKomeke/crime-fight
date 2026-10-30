import { useRouter } from 'expo-router'
import Head from 'expo-router/head'
import { StatusBar } from 'expo-status-bar'
import { type ReactNode, useState } from 'react'
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg'
import { HoverLink } from '@/components/HoverLink'
import { Icon } from '@/components/Icon'
import { SsoButton } from '@/components/SsoButton'
import { useToast } from '@/components/Toast'
import { Touchable } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { getConfig, type SsoProvider } from '@/lib/config'
import { documentTitle, pageMetadata } from '@/lib/seo'
import { brand, fonts, radius } from '@/theme'

export function generateMetadata() {
  return pageMetadata({ title: 'Sign in', path: '/sign-in', noindex: true })
}

/** Demo personas from the seed data, offered only when AUTH_MODE=dev (local and CI). */
const DEV_ACCOUNTS = [
  { handle: 'alexm', name: 'Alex Morgan', role: 'Member' },
  { handle: 'cityalerts', name: 'City Alerts', role: 'Official' },
  { handle: 'civicone', name: 'Civic One Newsroom', role: 'Press' },
  { handle: 'victimsupport', name: 'Victim Support', role: 'Support service' },
]

// A brand page, always on ink whatever the colour scheme (like the splash screen).
const muted = 'rgba(247,247,242,0.62)'
const hairline = 'rgba(247,247,242,0.22)'
const SHIELD = 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'
const WIDE = 1000

/**
 * Dedicated sign-in page outside the app shell. Wide screens pair the copy
 * with a large outlined shield; on web that split is decided by CSS
 * (`data-signin`) so the server render is right before hydration.
 */
export default function SignInScreen() {
  const router = useRouter()
  const toast = useToast()
  const { width } = useWindowDimensions()
  const { mode, signIn, status } = useAuth()
  const [busy, setBusy] = useState<SsoProvider | 'dev' | null>(null)
  const wide = Platform.OS !== 'web' && width >= WIDE
  const providers = (['google', 'apple'] as const).filter((p) => getConfig().ssoProviders.includes(p))

  const run = async (via: Parameters<typeof signIn>[0]) => {
    setBusy('provider' in via ? via.provider : 'dev')
    try {
      if (await signIn(via)) {
        toast('Welcome to CIVIC/ONE')
        router.replace('/')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Sign-in failed')
    } finally {
      setBusy(null)
    }
  }
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'))

  return (
    <Page>
      {Platform.OS === 'web' ? (
        <Head>
          <title>{documentTitle('Sign in')}</title>
        </Head>
      ) : (
        <StatusBar style="light" />
      )}

      <View dataSet={{ signin: 'content' }} style={styles.content}>
        <HoverLink href="/" accessibilityLabel="CIVIC/ONE home" style={styles.lockup} hoverStyle={{ opacity: 0.8 }}>
          <View style={styles.lockupMark}>
            <Icon name="shield" size={20} color={brand.lime} />
          </View>
          <Text style={styles.lockupText}>CIVIC/ONE</Text>
        </HoverLink>

        <Text dataSet={{ signin: 'headline' }} style={[styles.headline, wide && styles.headlineWide]} accessibilityRole="header">
          See clearly.{'\n'}Act safely.
        </Text>
        <Text style={styles.lede}>Verified local updates, official alerts and support from the people keeping your neighbourhood informed.</Text>

        <View style={styles.actions}>
          {status === 'signed-in' ? (
            <PillButton label="You’re signed in. Go to your feed" onPress={() => router.replace('/')} />
          ) : mode === 'cognito' ? (
            providers.length ? (
              <>
                <Text style={styles.join}>Join your neighbourhood.</Text>
                {providers.map((provider) => (
                  <SsoButton key={provider} provider={provider} loading={busy === provider} disabled={busy !== null} onPress={() => void run({ provider })} />
                ))}
                <Text style={styles.fine}>
                  We receive only your name and email address, never your password. By continuing, you agree to our Terms of Service and Privacy
                  Policy.
                </Text>
              </>
            ) : (
              <Text style={styles.join}>Sign-in opens soon.</Text>
            )
          ) : (
            <>
              <Text style={styles.devLabel}>Development sign-in · demo accounts</Text>
              {DEV_ACCOUNTS.map((account) => (
                <PillButton
                  key={account.handle}
                  label={account.name}
                  detail={account.role}
                  outline
                  disabled={busy !== null}
                  accessibilityLabel={`Sign in as ${account.name}, ${account.role}`}
                  onPress={() => void run({ devHandle: account.handle })}
                />
              ))}
            </>
          )}

          <Touchable onPress={leave} accessibilityRole="link" style={styles.browse} hoverStyle={{ opacity: 0.75 }}>
            <Text style={styles.browseText}>Browse updates without signing in</Text>
            <Icon name="arrowRight" size={16} color={muted} />
          </Touchable>
        </View>
      </View>

      {Platform.OS === 'web' || wide ? (
        <View dataSet={{ signin: 'mark' }} style={styles.markColumn} aria-hidden>
          <View style={styles.markBox}>
            <ShieldMark />
          </View>
        </View>
      ) : null}
    </Page>
  )
}

/** Web scrolls the document like every other page; native needs a scroll view and safe areas. */
function Page({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  if (Platform.OS === 'web') return <View style={styles.page}>{children}</View>
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.page, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {children}
    </ScrollView>
  )
}

function PillButton({
  label,
  detail,
  onPress,
  outline,
  disabled,
  accessibilityLabel,
}: {
  label: string
  detail?: string
  onPress: () => void
  outline?: boolean
  disabled?: boolean
  accessibilityLabel?: string
}) {
  const fg = outline ? brand.paper : brand.ink
  return (
    <Touchable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.pill, outline ? styles.pillOutline : styles.pillSolid, disabled && { opacity: 0.4 }]}
      hoverStyle={outline ? { backgroundColor: 'rgba(247,247,242,0.08)' } : { opacity: 0.9 }}
    >
      <Text style={[styles.pillLabel, { color: fg }]} numberOfLines={1}>
        {label}
        {detail ? <Text style={{ color: outline ? muted : fg, fontFamily: fonts.regular }}>{`  ·  ${detail}`}</Text> : null}
      </Text>
    </Touchable>
  )
}

/** The brand shield as a large double outline, lit in lime from the top. */
function ShieldMark() {
  return (
    <Svg width="100%" height="100%" viewBox="2.5 0.5 19 23" fill="none">
      <Defs>
        <LinearGradient id="signin-shield" x1="0" y1="0" x2="0.4" y2="1">
          <Stop offset="0" stopColor={brand.lime} stopOpacity={0.85} />
          <Stop offset="0.55" stopColor={brand.paper} stopOpacity={0.18} />
          <Stop offset="1" stopColor={brand.paper} stopOpacity={0.08} />
        </LinearGradient>
      </Defs>
      <Path d={SHIELD} stroke="url(#signin-shield)" strokeWidth={0.22} strokeLinejoin="round" />
      <G transform="translate(12 12) scale(0.8) translate(-12 -12)">
        <Path d={SHIELD} stroke={brand.paper} strokeOpacity={0.12} strokeWidth={0.27} strokeLinejoin="round" />
      </G>
    </Svg>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.ink },
  page: { flexGrow: 1, flexDirection: 'row', backgroundColor: brand.ink },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48, maxWidth: 640, alignSelf: 'stretch' },
  markColumn: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 },
  // Sized by the column, capped so the shield never outgrows the viewport height.
  markBox: { width: '100%', maxWidth: 560, aspectRatio: 19 / 23, ...(Platform.OS === 'web' ? ({ maxHeight: '78vh' } as object) : {}) },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', marginBottom: 40 },
  lockupMark: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: hairline },
  lockupText: { fontFamily: fonts.display, fontSize: 17, letterSpacing: -0.6, color: brand.paper },
  headline: { fontFamily: fonts.display, fontSize: 46, lineHeight: 48, letterSpacing: -1.8, color: brand.paper },
  headlineWide: { fontSize: 68, lineHeight: 70, letterSpacing: -2.6 },
  lede: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, color: muted, marginTop: 18, maxWidth: 440 },
  actions: { width: '100%', maxWidth: 380, gap: 12, marginTop: 40 },
  join: { fontFamily: fonts.displaySemibold, fontSize: 22, letterSpacing: -0.5, color: brand.paper, marginBottom: 6 },
  fine: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: muted, marginTop: 6 },
  devLabel: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase', color: brand.lime, marginBottom: 2 },
  pill: { height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1 },
  pillSolid: { backgroundColor: brand.paper, borderColor: brand.paper },
  pillOutline: { backgroundColor: 'transparent', borderColor: hairline },
  pillLabel: { fontFamily: fonts.semibold, fontSize: 15 },
  browse: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 18, paddingVertical: 4 },
  browseText: { fontFamily: fonts.semibold, fontSize: 14, color: muted },
})
