/// <reference types="expo/types" />

// Not in expo-env.d.ts: Expo owns that file and deletes or regenerates it on `expo start`.
declare global {
  interface Window {
    /** Public runtime config injected by +html.tsx on the server. */
    __CIVIC_CONFIG__?: import('../lib/config').RuntimeConfig
  }
}

export {}
