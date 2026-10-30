import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Icon } from '@/components/Icon'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Avatar, Button, Card, Touchable, Txt } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { pageMetadata } from '@/lib/seo'
import { brand, useColors } from '@/theme'

export function generateMetadata() {
  return pageMetadata({ title: 'Sign in', path: '/sign-in', noindex: true })
}

/** Demo personas from the seed data, offered only when AUTH_MODE=dev (local and CI). */
const DEV_ACCOUNTS = [
  { handle: 'alexm', name: 'Alex Morgan', role: 'Community member · can post updates', initials: 'AM' },
  { handle: 'cityalerts', name: 'City Alerts', role: 'Verified official · can publish alerts', initials: 'CA', official: true },
  { handle: 'civicone', name: 'Civic One Newsroom', role: 'Verified newsroom', initials: 'CN', official: true },
  { handle: 'victimsupport', name: 'Victim Support', role: 'Verified support service', initials: 'VS', official: true },
]

export default function SignInScreen() {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const { mode, signIn, status } = useAuth()
  const [busy, setBusy] = useState(false)

  const run = async (handle?: string) => {
    setBusy(true)
    try {
      await signIn(handle)
      toast('Welcome to CIVIC/ONE')
      router.replace('/')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Sign in" header={<PageHeader title="Sign in" back />}>
      <View style={styles.body}>
        <View style={[styles.mark, { backgroundColor: brand.ink }]}>
          <Icon name="shield" size={30} color={brand.lime} />
        </View>
        <Txt variant="display" style={{ textAlign: 'center', fontSize: 26, lineHeight: 32 }}>
          See clearly. Act safely.
        </Txt>
        <Txt color="textMuted" style={{ textAlign: 'center', maxWidth: 420 }}>
          Verified local updates, official alerts and support — with privacy protections built into every post.
        </Txt>

        {status === 'signed-in' ? (
          <Button label="You’re signed in — go to your feed" onPress={() => router.replace('/')} />
        ) : mode === 'cognito' ? (
          <View style={{ width: '100%', maxWidth: 360, gap: 10, marginTop: 10 }}>
            <Button label="Continue with email" size="lg" icon="lock" loading={busy} onPress={() => void run()} />
            <Txt variant="small" color="textMuted" style={{ textAlign: 'center' }}>
              Secured by Amazon Cognito with PKCE. We never see your password.
            </Txt>
          </View>
        ) : (
          <Card style={{ width: '100%', maxWidth: 440, marginTop: 10 }}>
            <View style={[styles.devHead, { borderBottomColor: c.line, backgroundColor: c.accentTint }]}>
              <Txt variant="micro" style={{ color: c.accentTintText }}>
                Development sign-in · choose a demo account
              </Txt>
            </View>
            {DEV_ACCOUNTS.map((account) => (
              <Touchable
                key={account.handle}
                disabled={busy}
                onPress={() => void run(account.handle)}
                accessibilityRole="button"
                accessibilityLabel={`Sign in as ${account.name}`}
                style={[styles.devRow, { borderBottomColor: c.line }]}
                hoverStyle={{ backgroundColor: c.surfaceAlt }}
              >
                <Avatar initials={account.initials} size={40} official={account.official} />
                <View style={{ flex: 1 }}>
                  <Txt variant="smallStrong">{account.name}</Txt>
                  <Txt variant="small" color="textMuted">
                    @{account.handle} · {account.role}
                  </Txt>
                </View>
                <Icon name="arrowRight" size={18} color={c.textMuted} />
              </Touchable>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingVertical: 40 },
  mark: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  devHead: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  devRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
})
