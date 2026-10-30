import type { ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { layout, useColors } from '@/theme'
import { BottomNav } from './BottomNav'
import { LeftRail } from './LeftRail'
import { RightRail } from './RightRail'
import { useShellMode } from './use-shell-mode'

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

  return (
    <View style={[styles.page, { backgroundColor: c.bg }]}>
      <View style={styles.columns}>
        {showLeft ? <LeftRail compact={mode === 'tablet'} /> : null}
        <View style={[styles.main, { backgroundColor: c.surface, borderRightColor: c.line }]} role="main">
          {children}
        </View>
        {showRight ? <RightRail /> : null}
      </View>
      {showBottom ? <BottomNav /> : null}
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
})
