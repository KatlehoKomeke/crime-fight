import { Redirect } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'

// On web the Cognito redirect lands in the sign-in popup; this hands the
// authorization code back to the opener window and closes the popup.
if (Platform.OS === 'web' && typeof window !== 'undefined') WebBrowser.maybeCompleteAuthSession()

export default function AuthCallback() {
  return <Redirect href="/" />
}
