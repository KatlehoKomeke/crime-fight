import { createContext, type Dispatch, type ReactNode, type SetStateAction, useContext, useLayoutEffect, useState } from 'react'
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { layout, useColors } from '@/theme'
import { BottomNav } from './BottomNav'
import { LeftRail } from './LeftRail'
import { RightRail } from './RightRail'
import { useShellMode } from './use-shell-mode'

const ScreenCountContext = createContext<Dispatch<SetStateAction<number | null>>>(() => undefined)

/** Every route's <Screen> reports in, so the shell can tell when a route is still loading. */
export function useScreenMounted() {
  const setCount = useContext(ScreenCountContext)
  // Layout effects also run when Suspense hides and reveals a screen, e.g. a search re-running its loader.
  useLayoutEffect(() => {
    setCount((count) => (count ?? 0) + 1)
    return () => setCount((count) => (count ?? 1) - 1)
  }, [setCount])
}

/**
 * Three-column layout from the original design on desktop, icon rail on
 * tablets, tab bar on phones. Same component tree on every platform.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const c = useColors()
  const mode = useShellMode()
  const web = mode === 'css'
  const showLeft = web || mode !== 'phone'
  const showRight = web || mode === 'desktop'
  const showBottom = web || mode === 'phone'
  // After a client-side navigation on web, the route's code and loader data
  // arrive before it renders, and Expo Router shows nothing meanwhile (split
  // routes ignore SuspenseFallback exports). No mounted screen means a route
  // is on its way. Null until the first screen mounts, so SSR never shows it.
  const [screens, setScreens] = useState<number | null>(null)

  return (
    <ScreenCountContext.Provider value={setScreens}>
      <View style={[styles.page, { backgroundColor: c.bg }]}>
        <View style={styles.columns}>
          {showLeft ? <LeftRail compact={mode === 'tablet'} /> : null}
          <View style={[styles.main, { backgroundColor: c.surface, borderRightColor: c.line }]} role="main">
            {children}
            {Platform.OS === 'web' && screens === 0 ? <RouteLoading /> : null}
          </View>
          {showRight ? <RightRail /> : null}
        </View>
        {showBottom ? <BottomNav /> : null}
      </View>
    </ScreenCountContext.Provider>
  )
}

function RouteLoading() {
  const c = useColors()
  return (
    // Fades in after a beat (globalCss), so fast navigations don't flash it.
    <View dataSet={{ delayedIn: true }} style={styles.loading}>
      <ActivityIndicator color={c.textMuted} accessibilityLabel="Loading page" />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center' },
  columns: {
    flex: 1,
    width: '100%',
    maxWidth: 1280,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    maxWidth: layout.main,
    minWidth: 0,
    borderRightWidth: Platform.OS === 'web' ? 1 : 0,
    ...(Platform.OS === 'web' ? ({ minHeight: '100vh', paddingBottom: 0 } as object) : null),
  },
  loading: { alignItems: 'center', paddingVertical: 96 },
})
