import { useRouter } from 'expo-router'
import { type ComponentProps, type ReactNode, useState } from 'react'
import { Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useMutation, useQuery } from 'urql'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Avatar, Button, Skeleton, Txt } from '@/components/ui'
import { SettingsQuery, UpdateProfile } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { useNear } from '@/lib/location'
import { pageMetadata } from '@/lib/seo'
import { fonts, radius, useColors } from '@/theme'

export function generateMetadata() {
  return pageMetadata({ title: 'Settings', path: '/settings', noindex: true })
}

const NAME_MAX = 50
const BIO_MAX = 160
const METHOD_LABEL = { google: 'Google', apple: 'Apple', dev: 'Development account' } as const

export default function SettingsScreen() {
  const { status } = useAuth()
  const Body = Platform.OS === 'web' ? View : ScrollView

  return (
    <Screen title="Settings" header={<PageHeader title="Settings" />}>
      <Body>
        {status === 'signed-in' ? <AccountSettings /> : status === 'signed-out' ? <SignedOut /> : <LoadingRows />}
        <LocationSettings />
      </Body>
    </Screen>
  )
}

function AccountSettings() {
  const router = useRouter()
  const { method, signOut } = useAuth()
  const [{ data, fetching }] = useQuery({ query: SettingsQuery })
  const viewer = data?.viewer
  if (!viewer) return fetching ? <LoadingRows /> : null

  return (
    <>
      <Section title="Profile">
        <ProfileForm key={viewer.id} viewer={viewer} />
      </Section>
      <Section title="Account">
        <Row label="Email" value={viewer.email ?? 'Not shared by your sign-in provider'} />
        <Row label="Signed in with" value={method ? METHOD_LABEL[method] : 'Single sign-on'} />
        <Row label="Handle" value={`@${viewer.handle}`} hint="Your public name in links and mentions. Handles can’t be changed yet." />
        <View style={styles.actions}>
          <Button label="Sign out" tone="outline" icon="logout" onPress={() => void signOut().then(() => router.replace('/'))} />
        </View>
      </Section>
    </>
  )
}

function ProfileForm({ viewer }: { viewer: { displayName: string; bio: string; initials: string; avatarUrl?: string | null } }) {
  const c = useColors()
  const toast = useToast()
  const [{ fetching }, updateProfile] = useMutation(UpdateProfile)
  const [displayName, setDisplayName] = useState(viewer.displayName)
  const [bio, setBio] = useState(viewer.bio)
  const name = displayName.trim()
  const changed = name !== viewer.displayName || bio.trim() !== viewer.bio
  const valid = name.length > 0 && name.length <= NAME_MAX && bio.length <= BIO_MAX

  const save = async () => {
    const result = await updateProfile({ input: { displayName: name, bio: bio.trim() } })
    if (result.error) toast(result.error.graphQLErrors[0]?.message ?? 'Couldn’t save your profile')
    else toast('Profile updated')
  }

  return (
    <View style={styles.form}>
      <View style={styles.formHead}>
        <Avatar initials={viewer.initials} url={viewer.avatarUrl} size={52} />
        <Txt variant="small" color="textMuted" style={{ flex: 1 }}>
          Your name and bio appear on your profile and next to your updates.
        </Txt>
      </View>
      <Field label="Display name" count={`${name.length}/${NAME_MAX}`}>
        <Input value={displayName} onChangeText={setDisplayName} maxLength={NAME_MAX + 10} accessibilityLabel="Display name" autoComplete="name" />
      </Field>
      <Field label="Bio" count={`${bio.length}/${BIO_MAX}`} over={bio.length > BIO_MAX}>
        <Input value={bio} onChangeText={setBio} multiline maxLength={BIO_MAX + 40} accessibilityLabel="Bio" placeholder="A line about you or your organisation" />
      </Field>
      {name.length === 0 ? (
        <Txt variant="small" style={{ color: c.danger }}>
          Your display name can’t be empty.
        </Txt>
      ) : null}
      <View style={styles.formActions}>
        <Button label="Save changes" loading={fetching} disabled={!changed || !valid} onPress={() => void save()} />
      </View>
    </View>
  )
}

function LocationSettings() {
  const near = useNear()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const share = async () => {
    setBusy(true)
    try {
      if (await near.locate()) toast('Using your approximate location')
      else toast('Location permission was not granted')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Location">
      <Row
        label="Nearby and Live radar use"
        value={near.source === 'device' ? 'Your approximate location' : 'The metro area (default)'}
        hint="Your position is rounded to about 1 km on this device before it’s used, and it’s never shown on your posts."
      />
      <View style={styles.actions}>
        {near.source === 'device' ? (
          <Button label="Stop using my location" tone="outline" icon="close" onPress={() => void near.reset()} />
        ) : (
          <Button label="Use my location" tone="outline" icon="location" loading={busy} onPress={() => void share()} />
        )}
      </View>
    </Section>
  )
}

function SignedOut() {
  const router = useRouter()
  return (
    <Section title="Account">
      <View style={styles.form}>
        <Txt color="textMuted">Sign in to edit your profile and manage your account.</Txt>
        <View style={styles.formActions}>
          <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        </View>
      </View>
    </Section>
  )
}

function LoadingRows() {
  return (
    <Section title="Account">
      <View style={[styles.form, { gap: 14 }]}>
        <Skeleton width="40%" />
        <Skeleton width="70%" />
        <Skeleton width="55%" />
      </View>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const c = useColors()
  return (
    <View style={[styles.section, { borderBottomColor: c.line }]}>
      <Txt variant="micro" color="textMuted" style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Txt>
      {children}
    </View>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.row}>
      <Txt variant="small" color="textMuted">
        {label}
      </Txt>
      <Txt variant="bodyStrong">{value}</Txt>
      {hint ? (
        <Txt variant="small" color="textMuted">
          {hint}
        </Txt>
      ) : null}
    </View>
  )
}

function Field({ label, count, over, children }: { label: string; count: string; over?: boolean; children: ReactNode }) {
  const c = useColors()
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.fieldHead}>
        <Txt variant="label">{label}</Txt>
        <Txt variant="small" style={{ color: over ? c.danger : c.textMuted }}>
          {count}
        </Txt>
      </View>
      {children}
    </View>
  )
}

function Input(props: ComponentProps<typeof TextInput>) {
  const c = useColors()
  const [focused, setFocused] = useState(false)
  return (
    <TextInput
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholderTextColor={c.textMuted}
      style={[
        styles.input,
        props.multiline && styles.inputMultiline,
        { color: c.text, backgroundColor: c.surface, borderColor: focused ? c.text : c.line },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  section: { borderBottomWidth: 1, paddingBottom: 8 },
  sectionTitle: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 4 },
  row: { gap: 3, paddingHorizontal: 18, paddingVertical: 10 },
  form: { gap: 16, paddingHorizontal: 18, paddingVertical: 12 },
  formHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontFamily: fonts.regular, fontSize: 15 },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
})
