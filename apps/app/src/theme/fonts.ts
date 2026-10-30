import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans'
import { SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk'
import { Platform } from 'react-native'

export const fontAssets = {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
}

type FontKey = keyof typeof fontAssets

// Native needs one registered family per weight; web gets a fallback stack so
// text renders immediately while the font streams in.
const family = (key: FontKey, fallback: string) => (Platform.OS === 'web' ? `${key}, ${fallback}` : key)
const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export const fonts = {
  regular: family('DMSans_400Regular', sans),
  medium: family('DMSans_500Medium', sans),
  semibold: family('DMSans_600SemiBold', sans),
  bold: family('DMSans_700Bold', sans),
  display: family('SpaceGrotesk_700Bold', sans),
  displaySemibold: family('SpaceGrotesk_600SemiBold', sans),
}
