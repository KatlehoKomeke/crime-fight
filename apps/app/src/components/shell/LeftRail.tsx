import { Link, usePathname, useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useQuery } from 'urql'
import { ViewerQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { useIsAdmin, usePaymentsStatus } from '@/lib/payments'
import { useUnreadNotifications } from '@/lib/unread-notifications'
import { useRequireAuth } from '@/lib/use-require-auth'
import { brand, fonts, layout, radius, useColors } from '@/theme'
import { useCompose } from '../ComposeProvider'
import { HoverLink } from '../HoverLink'
import { Icon, type IconName } from '../Icon'
import { UnreadBadge, useInboxState } from '../messages/inbox'
import { useToast } from '../Toast'
import { Avatar, Touchable, Txt } from '../ui'
import { railItems, sectionOf } from './nav'
import { SectionSwitch } from './SectionSwitch'

/** Icons whose filled form reads as a blob; they stay outlined when active. */
const OUTLINE_ONLY = new Set<IconName>(['search', 'settings', 'mail', 'bounty', 'shield'])

export function LeftRail({ compact }: { compact: boolean }) {
  const c = useColors()
  const pathname = usePathname()
  const router = useRouter()
  const newNotifications = useUnreadNotifications()
  const gate = useRequireAuth()
  const { openCompose } = useCompose()
  const { status } = useAuth()
  const [{ data }] = useQuery({ query: ViewerQuery, pause: status !== 'signed-in' })
  const viewer = status === 'signed-in' ? data?.viewer : null
  const { unread } = useInboxState()
  const isAdmin = useIsAdmin()
  const payments = usePaymentsStatus()
  const section = sectionOf(pathname)
  // `data-shell-label` hides labels below 1280px on web; native decides via `compact`.
  const labelProps = Platform.OS === 'web' ? { dataSet: { shellLabel: true } } : {}

  // The primary action follows the section: report a crime, or post a bounty (only while payments are on).
  const action =
    section === 'bounties'
      ? payments.enabled
        ? { label: 'Post a bounty', icon: 'bounty' as const, onPress: gate(() => router.push('/bounties/new'), 'Sign in to post a bounty') }
        : null
      : { label: 'Report a crime', icon: 'send' as const, onPress: gate(() => openCompose(), 'Sign in to report a crime') }

  return (
    <View dataSet={{ shell: 'left' }} style={[styles.rail, { width: compact ? layout.leftRailCompact : layout.leftRail, borderRightColor: c.line }]}>
      <View dataSet={{ railInner: true }} style={[styles.inner, compact && styles.innerCompact]}>
        <Link href="/" asChild>
          <Pressable style={styles.logo} accessibilityLabel="CIVIC/ONE home">
            <View style={styles.logoMark}>
              <Icon name="shield" size={19} color={brand.lime} />
            </View>
            {!compact ? (
              <Txt {...labelProps} style={[styles.logoText, { color: c.text }]}>
                CIVIC/ONE
              </Txt>
            ) : null}
          </Pressable>
        </Link>

        <SectionSwitch section={section} compact={compact} />

        <View style={styles.nav} role="navigation" aria-label="Main">
          {railItems(viewer?.handle ?? null, section, isAdmin).map((item) => {
            const active = item.match(pathname)
            const dot = item.key === 'notifications' && newNotifications
            return (
              <HoverLink
                key={item.key}
                href={item.href as never}
                dataSet={{ railItem: true }}
                accessibilityLabel={dot ? `${item.label} (new)` : item.label}
                accessibilityState={{ selected: active }}
                aria-current={active ? 'page' : undefined}
                style={[styles.navItem, compact && styles.navItemCompact, active && { backgroundColor: c.surfaceAlt }]}
                hoverStyle={{ backgroundColor: c.surfaceAlt }}
              >
                <View>
                  <Icon name={item.icon} size={23} color={c.text} filled={active && !OUTLINE_ONLY.has(item.icon)} />
                  {dot ? <View style={[styles.dot, { backgroundColor: brand.coral, borderColor: c.bg }]} /> : null}
                  {item.key === 'messages' ? <UnreadBadge count={unread} /> : null}
                </View>
                {!compact ? (
                  <Txt {...labelProps} style={[styles.navLabel, { color: c.text, fontFamily: active ? fonts.bold : fonts.regular }]}>
                    {item.label}
                  </Txt>
                ) : null}
              </HoverLink>
            )
          })}
        </View>

        {action ? (
          <Touchable
            dataSet={{ railItem: true }}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={[styles.post, { backgroundColor: c.primary }, compact && styles.postCompact]}
            hoverStyle={Platform.OS === 'web' ? { transform: [{ translateY: -2 }] } : undefined}
          >
            {!compact ? (
              <Txt {...labelProps} variant="bodyStrong" style={{ color: c.onPrimary }}>
                {action.label}
              </Txt>
            ) : null}
            <Icon name={action.icon} size={20} color={c.primary === brand.ink ? brand.lime : c.onPrimary} />
          </Touchable>
        ) : section === 'bounties' && payments.known && !compact ? (
          <Txt {...labelProps} variant="small" color="textMuted" style={styles.comingSoon}>
            Posting bounties opens once payments are switched on.
          </Txt>
        ) : null}

        <View style={{ flex: 1 }} />

        <AccountButton compact={compact} viewer={viewer ?? null} labelProps={labelProps} />
      </View>
    </View>
  )
}

/**
 * Sign in when signed out; Sign out (showing who) when signed in. Keyed off the
 * session rather than the viewer query, so it flips the moment you sign in or
 * out. While the session is still being read (always, on the server) neither
 * action is shown, so the wrong one never flashes.
 */
function AccountButton({
  compact,
  viewer,
  labelProps,
}: {
  compact: boolean
  viewer: { handle: string; initials: string; avatarUrl?: string | null } | null
  labelProps: object
}) {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const { status, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const frame = [styles.account, compact && styles.accountCompact, { borderColor: c.line, borderWidth: 1 }]

  if (status === 'loading') return <View style={[styles.account, compact && styles.accountCompact, styles.accountPlaceholder]} />

  if (status === 'signed-out') {
    return (
      <Touchable onPress={() => router.push('/sign-in')} accessibilityRole="button" accessibilityLabel="Sign in" style={frame} hoverStyle={{ backgroundColor: c.surfaceAlt }}>
        <Icon name="profile" size={20} color={c.text} />
        {!compact ? (
          <Txt {...labelProps} variant="label">
            Sign in
          </Txt>
        ) : null}
      </Touchable>
    )
  }

  return (
    <Touchable
      onPress={() => {
        setSigningOut(true)
        void signOut()
          .then(() => toast('You’re signed out'))
          .finally(() => setSigningOut(false))
      }}
      disabled={signingOut}
      accessibilityRole="button"
      accessibilityLabel={viewer ? `Sign out of @${viewer.handle}` : 'Sign out'}
      accessibilityState={{ busy: signingOut }}
      style={frame}
      hoverStyle={{ backgroundColor: c.surfaceAlt }}
    >
      {/* Who is signed in; on the narrow rail only the sign-out icon remains. */}
      {!compact && viewer ? (
        <View dataSet={{ shellWide: true }}>
          <Avatar initials={viewer.initials} url={viewer.avatarUrl} size={32} />
        </View>
      ) : null}
      {!compact ? (
        <View {...labelProps} style={styles.accountName}>
          <Txt variant="label" numberOfLines={1}>
            Sign out
          </Txt>
          {viewer ? (
            <Txt variant="small" color="textMuted" numberOfLines={1}>
              @{viewer.handle}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {signingOut ? <ActivityIndicator size="small" color={c.text} style={{ width: 20 }} /> : <Icon name="logout" size={20} color={c.text} />}
    </Touchable>
  )
}

const styles = StyleSheet.create({
  rail: {
    borderRightWidth: 1,
    alignItems: 'flex-end',
    ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0, height: '100vh' } as object) : { height: '100%' }),
  },
  inner: { width: '100%', height: '100%', paddingTop: 22, paddingBottom: 18, paddingLeft: 12, paddingRight: 22 },
  innerCompact: { paddingHorizontal: 13, alignItems: 'center' },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 18 },
  logoMark: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.ink },
  logoText: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -1.1 },
  nav: { gap: 4 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 18, alignSelf: 'flex-start', minHeight: 50, paddingHorizontal: 15, borderRadius: radius.pill },
  navItemCompact: { width: 50, height: 50, paddingHorizontal: 0, justifyContent: 'center', alignSelf: 'center' },
  navLabel: { fontSize: 17 },
  dot: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  post: { marginTop: 19, minHeight: 52, paddingHorizontal: 20, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  postCompact: { width: 52, height: 52, paddingHorizontal: 0, justifyContent: 'center' },
  comingSoon: { marginTop: 19, paddingHorizontal: 15 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.pill },
  accountCompact: { padding: 4 },
  accountName: { flex: 1, minWidth: 0 },
  accountPlaceholder: { minHeight: 38 },
})
