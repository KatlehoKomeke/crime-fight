import { Link, usePathname } from 'expo-router'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from 'urql'
import { ViewerQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { useRequireAuth } from '@/lib/use-require-auth'
import { brand, fixed, useColors } from '@/theme'
import { useCompose } from '../ComposeProvider'
import { Icon } from '../Icon'
import { navItems } from './nav'

/** Phone navigation: tab bar plus a floating compose button. */
export function BottomNav() {
  const c = useColors()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const { status } = useAuth()
  const gate = useRequireAuth()
  const { openCompose } = useCompose()
  const [{ data }] = useQuery({ query: ViewerQuery, pause: status !== 'signed-in' })
  const items = navItems(status === 'signed-in' ? (data?.viewer?.handle ?? null) : null).filter((item) => item.phone)

  return (
    <>
      <Pressable
        dataSet={{ shell: 'fab' }}
        onPress={gate(() => openCompose(), 'Sign in to post an update')}
        accessibilityRole="button"
        accessibilityLabel="Post an update"
        style={[styles.fab, fixed, { bottom: insets.bottom + 74, backgroundColor: c.primary }]}
      >
        <Icon name="plus" size={24} color={c.primary === brand.ink ? brand.lime : c.onPrimary} />
      </Pressable>
      <View
        dataSet={{ shell: 'bottom' }}
        role="navigation"
        aria-label="Main"
        style={[styles.bar, fixed, { paddingBottom: insets.bottom, backgroundColor: c.headerBg, borderTopColor: c.line }]}
      >
        {items.map((item) => {
          const active = item.match(pathname)
          return (
            <Link key={item.key} href={item.href as never} asChild>
              <Pressable accessibilityLabel={item.label} accessibilityState={{ selected: active }} aria-current={active ? 'page' : undefined} style={styles.item}>
                <Icon name={item.icon} size={24} color={active ? c.accentText : c.text} filled={active && item.icon !== 'search' && item.icon !== 'radar'} />
                {item.key === 'alerts' ? <View style={[styles.dot, { backgroundColor: brand.coral, borderColor: c.surface }]} /> : null}
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
