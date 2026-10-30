import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * One codebase, three stages. Native builds bake their stage in at build time
 * (EAS profiles set CIVIC_STAGE); the web server reads runtime env instead.
 */
const stage = process.env.CIVIC_STAGE ?? 'local'
const isProd = stage === 'prod'
const id = isProd ? 'app.civicone' : `app.civicone.${stage}`

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProd ? 'CIVIC/ONE' : `CIVIC/ONE ${stage.toUpperCase()}`,
  slug: 'civic-one',
  scheme: isProd ? 'civicone' : `civicone-${stage}`,
  version: '1.0.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: id,
    supportsTablet: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: id.replace(/-/g, '_'),
    permissions: ['ACCESS_COARSE_LOCATION'],
  },
  // The SVG favicon is linked from src/app/+html.tsx and served from public/.
  web: {
    output: 'server',
    bundler: 'metro',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-web-browser',
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'CIVIC/ONE uses your approximate location to show nearby updates and alerts. It is never posted without your say-so.',
      },
    ],
    ['expo-splash-screen', { backgroundColor: '#10110f', dark: { backgroundColor: '#0b0c0a' } }],
  ],
  extra: {
    stage,
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    siteUrl: process.env.EXPO_PUBLIC_SITE_URL,
    authMode: process.env.EXPO_PUBLIC_AUTH_MODE ?? (stage === 'local' ? 'dev' : 'cognito'),
    cognitoDomain: process.env.EXPO_PUBLIC_COGNITO_DOMAIN,
    cognitoClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID,
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
})
