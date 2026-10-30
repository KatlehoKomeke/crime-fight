import { Slot, Stack } from 'expo-router'
import { Platform } from 'react-native'
import { AppShell } from '@/components/shell/AppShell'

/** Web renders routes in document flow (Slot); native gets a real navigation stack. */
export default function MainLayout() {
  return <AppShell>{Platform.OS === 'web' ? <Slot /> : <Stack screenOptions={{ headerShown: false }} />}</AppShell>
}
