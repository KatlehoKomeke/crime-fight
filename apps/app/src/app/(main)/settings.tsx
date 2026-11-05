import { graphql } from '@civic/graphql'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useMutation, useQuery } from 'urql'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Avatar, Button, Field, Input, Row, Section, Skeleton, Txt } from '@/components/ui'
import { SettingsQuery, UpdateProfile } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { pageMetadata } from '@/lib/seo'
import { useColors } from '@/theme'

export function generateMetadata() {
  return pageMetadata({ title: 'Settings', path: '/settings', noindex: true })
}

const NAME_MAX = 50
const BIO_MAX = 160
const METHOD_LABEL = { google: 'Google', apple: 'Apple', dev: 'Development account' } as const

const DeleteAccountMutation = graphql(`
  mutation DeleteAccount($handle: String!) {
    deleteAccount(handle: $handle)
  }
`)

export default function SettingsScreen() {
  const { status } = useAuth()
  const Body = Platform.OS === 'web' ? View : ScrollView

  return (
    <Screen title="Settings" header={<PageHeader title="Settings" />}>
      <Body>
        {status === 'signed-in' ? <AccountSettings /> : status === 'signed-out' ? <SignedOut /> : <LoadingRows />}
      </Body>
    </Screen>
  )
}

function AccountSettings() {
  const router = useRouter()
  const { method, signOut } = useAuth()
  const [{ data, fetching }] = useQuery({ query: SettingsQuery })
  const [signingOut, setSigningOut] = useState(false)
  const viewer = data?.viewer
  if (!viewer) return fetching ? <LoadingRows /> : null

  const leave = () => {
    setSigningOut(true)
    void signOut().then(() => router.replace('/'))
  }

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
          <Button label="Sign out" tone="outline" icon="logout" loading={signingOut} onPress={leave} />
        </View>
      </Section>
      <Section title="Delete account">
        <DeleteAccount handle={viewer.handle} />
      </Section>
    </>
  )
}

function DeleteAccount({ handle }: { handle: string }) {
  const router = useRouter()
  const toast = useToast()
  const { signOut } = useAuth()
  const [, deleteAccount] = useMutation(DeleteAccountMutation)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const confirmed = typed.trim().replace(/^@/, '').toLowerCase() === handle

  const remove = async () => {
    setDeleting(true)
    const result = await deleteAccount({ handle: typed })
    if (!result.data?.deleteAccount) {
      setDeleting(false)
      toast(result.error?.graphQLErrors[0]?.message ?? 'Couldn’t delete your account. Please try again.')
      return
    }
    toast('Your account has been deleted')
    await signOut()
    router.replace('/')
  }

  if (!open) {
    return (
      <View style={styles.form}>
        <Txt variant="small" color="textMuted">
          Permanently delete your account and everything you’ve shared on CIVIC/ONE.
        </Txt>
        <View style={styles.formActions}>
          <Button label="Delete account" tone="outline" icon="trash" onPress={() => setOpen(true)} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.form}>
      <Txt variant="bodyStrong">This can’t be undone.</Txt>
      <Txt variant="small" color="textMuted">
        We’ll delete your profile, your posts and the replies under them, your likes, reposts, saved posts and follows, and your conversations for both
        people in them. Your sign-in is removed too, so signing in again starts a new account.
      </Txt>
      <View style={{ gap: 6 }}>
        <Txt variant="label">Type @{handle} to confirm</Txt>
        <Input value={typed} onChangeText={setTyped} placeholder={`@${handle}`} autoCapitalize="none" autoCorrect={false} accessibilityLabel={`Type @${handle} to confirm`} />
      </View>
      <View style={styles.formActions}>
        <Button label="Delete my account" tone="danger" icon="trash" loading={deleting} disabled={!confirmed} onPress={() => void remove()} />
        <Button
          label="Cancel"
          tone="ghost"
          disabled={deleting}
          onPress={() => {
            setOpen(false)
            setTyped('')
          }}
        />
      </View>
    </View>
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

const styles = StyleSheet.create({
  form: { gap: 16, paddingHorizontal: 18, paddingVertical: 12 },
  formHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
})
