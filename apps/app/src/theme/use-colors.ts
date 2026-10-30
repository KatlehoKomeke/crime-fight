import { useColorScheme } from 'react-native'
import { dark, light, type Palette } from './palette'

/** Native: concrete colours for the current system appearance. */
export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light
}
