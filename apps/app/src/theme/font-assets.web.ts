/**
 * Latin-subset WOFF2 copies of the native TTFs (scripts/subset-fonts.sh), about
 * 18KB each. The document head declares them (web-fonts.ts) instead of expo-font
 * registering them at runtime. Requiring them here, in a module the client bundle
 * loads, is what makes `expo export` publish the files; Metro resolves each to
 * its hashed URL.
 */
export const webFontFiles: Record<string, string> = {
  DMSans_400Regular: require('../../assets/fonts/DMSans_400Regular.woff2'),
  DMSans_500Medium: require('../../assets/fonts/DMSans_500Medium.woff2'),
  DMSans_600SemiBold: require('../../assets/fonts/DMSans_600SemiBold.woff2'),
  DMSans_700Bold: require('../../assets/fonts/DMSans_700Bold.woff2'),
  SpaceGrotesk_600SemiBold: require('../../assets/fonts/SpaceGrotesk_600SemiBold.woff2'),
  SpaceGrotesk_700Bold: require('../../assets/fonts/SpaceGrotesk_700Bold.woff2'),
}

export const fontAssets: Record<string, never> = {}
