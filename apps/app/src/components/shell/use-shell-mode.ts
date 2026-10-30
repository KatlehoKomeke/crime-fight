import { Platform, useWindowDimensions } from 'react-native'

export type ShellMode = 'phone' | 'tablet' | 'desktop' | 'css'

/**
 * Native picks a layout from the window size. Web returns `css`: everything is
 * rendered and media queries decide visibility, because the server cannot know
 * the viewport and JS-driven layout would flash after hydration.
 */
export function useShellMode(): ShellMode {
  const { width } = useWindowDimensions()
  if (Platform.OS === 'web') return 'css'
  if (width >= 1080) return 'desktop'
  if (width >= 760) return 'tablet'
  return 'phone'
}
