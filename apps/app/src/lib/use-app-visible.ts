import { useEffect, useState } from 'react'
import { AppState, Platform } from 'react-native'

/** Whether the app is in front of the user: a visible browser tab, or the foreground app on a phone. */
export function useAppVisible(): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const update = () => setVisible(document.visibilityState === 'visible')
      update()
      document.addEventListener('visibilitychange', update)
      return () => document.removeEventListener('visibilitychange', update)
    }
    const subscription = AppState.addEventListener('change', (state) => setVisible(state === 'active'))
    return () => subscription.remove()
  }, [])
  return visible
}
