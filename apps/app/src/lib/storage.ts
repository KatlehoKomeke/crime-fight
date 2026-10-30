import * as SecureStore from 'expo-secure-store'

/** Native: Keychain / Keystore-backed storage for session tokens and preferences. */
export const storage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
}
