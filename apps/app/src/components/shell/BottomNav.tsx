import { Link, usePathname, useRouter } from 'expo-router'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from 'urql'
import { ViewerQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { usePaymentsStatus } from '@/lib/payments'
import { useUnreadNotifications } from '@/lib/unread-notifications'
import { useRequireAuth } from '@/lib/use-require-auth'
import { brand, fixed, useColors } from '@/theme'
import { useCompose } from '../ComposeProvider'
import { Icon } from '../Icon'
import { phoneTabs, sectionOf } from './nav'

/** Bounty pages that are themselves a form, a payment step or the review queue: no floating button over them. */
const NO_FAB = /^\/bounties\/(new|review|rules|[^/]+\/(claim|paid|pay))/

/** Phone navigation: tab bar plus a floating button to report a crime or post a bounty. */
export function BottomNav() {
  const c = useColors()
  const pathname = usePathname()
  const router = useRouter()
  const unread = useUnreadNotifications()
  const insets = useSafeAreaInsets()
  const { status } = useAuth()
  const gate = useRequireAuth()
  const { openCompose } = useCompose()
  const payments = usePaymentsStatus()
  const [{ data }] = useQuery({ query: ViewerQuery, pause: status !== 'signed-in' })
  const items = phoneTabs(status === 'signed-in' ? (data?.viewer?.handle ?? null) : null)
  const section = sectionOf(pathname)
  // A conversation's composer owns the bottom of the screen; posting doesn't belong anywhere in Messages.
  if (/^\/messages\/(?!new$)[^/]+$/.test(pathname)) return null

  const fab =
    section === 'bounties'
      ? payments.enabled && !NO_FAB.test(pathname)
        ? { label: 'Post a bounty', icon: 'bounty' as const, onPress: gate(() => router.push('/bounties/new'), 'Sign in to post a bounty') }
        : null
      : pathname.startsWith('/messages')
        ? null
        : { label: 'Report a crime', icon: 'plus' as const, onPress: gate(() => openCompose(), 'Sign in to report a crime') }

  return (
    <>
      {fab ? (
        <Pressable dataSet={{ shell: 'fab' }} onPress={fab.onPress} accessibilityRole="button" accessibilityLabel={fab.label} style={[styles.fab, fixed, { bottom: insets.bottom + 74, backgroundColor: c.primary }]}>
          <Icon name={fab.icon} size={24} color={c.primary === brand.ink ? brand.lime : c.onPrimary} />
        </Pressable>
      ) : null}
      <View
        dataSet={{ shell: 'bottom' }}
        role="navigation"
        aria-label="Main"
        style={[styles.bar, fixed, { paddingBottom: insets.bottom, backgroundColor: c.headerBg, borderTopColor: c.line }]}
      >
        {items.map((item) => {
          const active = item.match(pathname)
          const dot = item.key === 'notifications' && unread
          return (
            <Link key={item.key} href={item.href as never} asChild>
              <Pressable accessibilityLabel={dot ? `${item.label} (new)` : item.label} accessibilityState={{ selected: active }} aria-current={active ? 'page' : undefined} style={styles.item}>
                <Icon name={item.icon} size={24} color={active ? c.accentText : c.text} filled={active && item.icon !== 'search' && item.icon !== 'bounty'} />
                {dot ? <View style={[styles.dot, { backgroundColor: brand.coral, borderColor: c.surface }]} /> : null}
              </Pressable>
            </Link>
          )
        })}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  bar: {
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(12px)', display: 'none' } as object) : null),
  },
  item: { width: 52, height: 56, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 14, right: 12, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  fab: {
    right: 18,
    zIndex: 41,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    ...(Platform.OS === 'web' ? ({ display: 'none' } as object) : null),
  },
})
