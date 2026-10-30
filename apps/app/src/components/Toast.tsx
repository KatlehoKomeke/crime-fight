import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fixed, fonts, radius, useColors } from '@/theme'
import { Icon } from './Icon'

const ToastContext = createContext<(message: string) => void>(() => undefined)

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const [message, setMessage] = useState<string | null>(null)
  const [opacity] = useState(() => new Animated.Value(0))
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const show = useCallback(
    (next: string) => {
      clearTimeout(timer.current)
      setMessage(next)
      AccessibilityInfo.announceForAccessibility(next)
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start()
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => setMessage(null))
      }, 2400)
    },
    [opacity],
  )

  useEffect(() => () => clearTimeout(timer.current), [])
  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <View pointerEvents="none" style={[styles.wrap, fixed, { bottom: insets.bottom + 76 }]}>
          <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.toast, { opacity, backgroundColor: c.inverse, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}
          >
            <Icon name="check" size={16} color={c.accent} />
            <Text style={[styles.text, { color: c.onInverse }]}>{message}</Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 200 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 17,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  text: { fontFamily: fonts.semibold, fontSize: 13 },
})
