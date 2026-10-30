import { useRouter } from 'expo-router'
import Head from 'expo-router/head'
import type { ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { documentTitle } from '@/lib/seo'
import { brand, fonts, sticky, useColors } from '@/theme'
import { Icon } from './Icon'
import { IconButton, Txt } from './ui'

/**
 * Main column. On web the header is sticky over document scroll; on native it
 * sits above the list. `title` keeps the document title correct after
 * client-side navigation (generateMetadata only covers the first, server render).
 */
export function Screen({ title, header, children }: { title: string; header: ReactNode; children: ReactNode }) {
  const c = useColors()
  return (
    <View style={[styles.screen, { backgroundColor: c.surface }]}>
      {Platform.OS === 'web' ? (
        <Head>
          <title>{documentTitle(title)}</title>
        </Head>
      ) : null}
      {header}
      {children}
    </View>
  )
}

export function PageHeader({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  const c = useColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.header, sticky, { backgroundColor: c.headerBg, borderBottomColor: c.line, paddingTop: Platform.OS === 'web' ? 0 : insets.top }]}>
      <View style={styles.headerRow}>
        {back ? <IconButton icon="arrowLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : <MobileBrand />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="title" numberOfLines={1} accessibilityRole="header">
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="small" color="textMuted" numberOfLines={1}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  )
}

/** Shield mark shown in headers on phones, where the left rail is hidden. */
export function MobileBrand() {
  return (
    <View dataSet={{ mobileOnly: true }} style={[styles.brand, Platform.OS === 'web' && { display: 'none' }]}>
      <View style={styles.brandMark}>
        <Icon name="shield" size={16} color={brand.lime} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: Platform.OS === 'web' ? '100%' : undefined },
  header: {
    zIndex: 20,
    borderBottomWidth: 1,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(12px)' } as object) : null),
  },
  headerRow: { minHeight: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { width: 36, alignItems: 'center' },
  brandMark: { width: 31, height: 31, borderRadius: 16, backgroundColor: brand.ink, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: fonts.display },
})
