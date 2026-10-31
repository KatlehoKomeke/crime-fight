import type { ReactNode } from 'react'

/**
 * The web renders routes in document flow with no gesture-driven navigation,
 * so it skips react-native-gesture-handler, which also pulls in
 * react-native-reanimated: ~900 KB of JavaScript on every page.
 */
export function GestureRoot({ children }: { children: ReactNode }) {
  return children
}
