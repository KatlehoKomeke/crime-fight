import { Platform, type ViewStyle } from 'react-native'

export { fonts, fontAssets } from './fonts'
export { brand, type ColorName, type Palette } from './palette'
export { useColors } from './use-colors'

// The web uses document scrolling (crawlable, native-feeling, sticky headers),
// so overlays must be viewport-fixed there. React Native Web supports these
// values even though React Native's types do not.
export const fixed = (Platform.OS === 'web' ? { position: 'fixed' } : { position: 'absolute' }) as ViewStyle
export const sticky = (Platform.OS === 'web' ? { position: 'sticky', top: 0 } : {}) as ViewStyle

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const
export const radius = { sm: 4, md: 12, lg: 16, pill: 999 } as const

/** Column widths from the original layout. */
export const layout = { leftRail: 250, leftRailCompact: 88, main: 620, right: 350 } as const
