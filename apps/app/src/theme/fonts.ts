import { Platform } from 'react-native'
import type { fontAssets as nativeFontAssets } from './font-assets'

export { fontAssets } from './font-assets'

export type FontFamily = keyof typeof nativeFontAssets

// Native needs one registered family per weight; web gets a fallback stack so
// text renders immediately while the font streams in.
const family = (key: FontFamily, fallback: string) => (Platform.OS === 'web' ? `${key}, ${fallback}` : key)
const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export const fonts = {
  regular: family('DMSans_400Regular', sans),
  medium: family('DMSans_500Medium', sans),
  semibold: family('DMSans_600SemiBold', sans),
  bold: family('DMSans_700Bold', sans),
  display: family('SpaceGrotesk_700Bold', sans),
  displaySemibold: family('SpaceGrotesk_600SemiBold', sans),
}
