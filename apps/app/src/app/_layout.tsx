import { useFonts } from 'expo-font'
import { Slot, Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { ComposeProvider } from '@/components/ComposeProvider'
import { GestureRoot } from '@/components/GestureRoot'
import { ToastProvider } from '@/components/Toast'
import { AuthProvider } from '@/lib/auth'
import { GraphQLProvider } from '@/lib/graphql/provider'
import { LocationProvider } from '@/lib/location'
import { fontAssets } from '@/theme'

if (Platform.OS !== 'web') void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets)

  useEffect(() => {
    if (fontsLoaded && Platform.OS !== 'web') void SplashScreen.hideAsync()
  }, [fontsLoaded])

  // Web never blocks on fonts: server-rendered HTML must paint immediately.
  if (!fontsLoaded && Platform.OS !== 'web') return null

  return (
    <GestureRoot>
      <AuthProvider>
        <GraphQLProvider>
          <LocationProvider>
            <ToastProvider>
              <ComposeProvider>
                {Platform.OS === 'web' ? <Slot /> : <Stack screenOptions={{ headerShown: false }} />}
                <StatusBar style="auto" />
              </ComposeProvider>
            </ToastProvider>
          </LocationProvider>
        </GraphQLProvider>
      </AuthProvider>
    </GestureRoot>
  )
}
