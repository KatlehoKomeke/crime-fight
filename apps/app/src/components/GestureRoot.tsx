import type { ReactNode } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

/** Native needs the gesture-handler root for navigation gestures. See GestureRoot.web.tsx. */
export function GestureRoot({ children }: { children: ReactNode }) {
  return <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>
}
