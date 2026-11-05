import { PAYOUT_ACCOUNT_HOLD_HOURS } from '@civic/core'
import { graphql, type PayoutSettingsQuery as PayoutSettingsData } from '@civic/graphql'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useMutation, useQuery } from 'urql'
import { HoverLink } from '@/components/HoverLink'
import { Icon } from '@/components/Icon'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Avatar, Button, Chip, Field, Input, Row, Section, Skeleton, Txt } from '@/components/ui'
import { BanksQuery, PayoutSettingsQuery, SetPayoutAccount, SettingsQuery, UpdateProfile } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { formatDateTime } from '@/lib/bounty-copy'
import { usePaymentsStatus } from '@/lib/payments'
import { useSchemas } from '@/lib/schemas'
import { pageMetadata } from '@/lib/seo'
import { radius, useColors } from '@/theme'

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

type PayoutViewer = NonNullable<PayoutSettingsData['viewer']>
type PayoutField = 'accountName' | 'bankCode' | 'accountNumber'

const inFuture = (value: string) => new Date(value).getTime() > Date.now()

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
  const [{ data: payoutData, fetching: payoutFetching }] = useQuery({ query: PayoutSettingsQuery })
  const [signingOut, setSigningOut] = useState(false)
  const viewer = data?.viewer
  if (!viewer) return fetching ? <LoadingRows /> : null
  const payoutViewer = payoutData?.viewer ?? null

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
      <Section title="Payouts">
        <PayoutSettings viewer={payoutViewer} loading={payoutFetching} />
      </Section>
      <Section title="Delete account">
        <DeleteAccount handle={viewer.handle} heldBountyIds={payoutViewer?.heldBountyIds ?? []} />
      </Section>
    </>
  )
}

function PayoutSettings({ viewer, loading }: { viewer: PayoutViewer | null; loading: boolean }) {
  const payments = usePaymentsStatus()
  const [editing, setEditing] = useState(false)
  // The bank list is only needed once the form is open.
  const [banks, refetchBanks] = useQuery({ query: BanksQuery, pause: !editing })
  const account = viewer?.payoutAccount ?? null

  if (payments.known && !payments.enabled) {
    return (
      <View style={styles.form}>
        <Txt variant="small" color="textMuted">
          Payouts open once payments are switched on.
        </Txt>
      </View>
    )
  }
  if (!viewer || !payments.known) {
    return loading || !payments.known ? (
      <View style={[styles.form, { gap: 14 }]}>
        <Skeleton width="70%" />
        <Skeleton width="45%" />
      </View>
    ) : (
      <View style={styles.form}>
        <Txt variant="small" color="textMuted">
          Couldn’t load your payout details. Reload to try again.
        </Txt>
      </View>
    )
  }

  const ready = account ? !inFuture(account.readyAt) : false

  return (
    <>
      <View style={styles.note}>
        <Txt variant="small" color="textMuted">
          Bounty rewards are paid to one South African bank account in your own name. We send the name to our payment provider and keep only the bank, the name and
          the last four digits.
        </Txt>
      </View>
      {account ? (
        <Row
          label="Bank account"
          value={`${account.bankName} •••• ${account.accountLast4}`}
          hint={`Account holder: ${account.accountName}. ${ready ? 'Ready for payouts.' : `Payouts possible from ${formatDateTime(account.readyAt)}.`}`}
        />
      ) : null}
      {editing ? (
        <View style={styles.form}>
          <PayoutAccountForm
            displayName={viewer.displayName}
            banks={banks.data?.banks ?? null}
            banksFailed={Boolean(banks.error) && !banks.data}
            onRetryBanks={() => refetchBanks({ requestPolicy: 'network-only' })}
            onDone={() => setEditing(false)}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          {account ? (
            <Button label="Replace account" tone="ghost" onPress={() => setEditing(true)} />
          ) : (
            <Button label="Add bank account" tone="outline" icon="bounty" onPress={() => setEditing(true)} />
          )}
        </View>
      )}
      <View style={styles.notes}>
        {account ? (
          <Txt variant="small" color="textMuted">
            To stop payouts, replace it with another account or email us.
          </Txt>
        ) : null}
        <Txt variant="small" color="textMuted">
          Payouts to a new bank account start {PAYOUT_ACCOUNT_HOLD_HOURS} hours after you add it.
        </Txt>
        <Txt variant="small" color="textMuted">
          Rewards are usually taxable income. SARS has treated informant rewards as income — declaring it is up to you.
        </Txt>
        {payments.sandbox ? (
          <Txt variant="small" color="textMuted">
            Sandbox: an account number ending 0000 fails payouts; 9999 pays and then reverses.
          </Txt>
        ) : null}
      </View>
    </>
  )
}

function PayoutAccountForm({
  displayName,
  banks,
  banksFailed,
  onRetryBanks,
  onDone,
}: {
  displayName: string
  banks: { name: string; code: string }[] | null
  banksFailed: boolean
  onRetryBanks: () => void
  onDone: () => void
}) {
  const c = useColors()
  const toast = useToast()
  const [{ fetching }, setPayoutAccount] = useMutation(SetPayoutAccount)
  const schemas = useSchemas()
  const [accountName, setAccountName] = useState(displayName)
  const [bankCode, setBankCode] = useState<string | null>(null)
  const [accountNumber, setAccountNumber] = useState('')
  const [touched, setTouched] = useState<Partial<Record<PayoutField, boolean>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  // The same rules the API applies, so a refusal is explained before the request is sent.
  const parsed = schemas?.payoutAccountSchema.safeParse({ accountName, bankCode: bankCode ?? '', accountNumber })
  const errorFor = (field: PayoutField) => (touched[field] && parsed && !parsed.success ? (parsed.error.issues.find((issue) => issue.path[0] === field)?.message ?? null) : null)
  const touch = (field: PayoutField) => setTouched((current) => ({ ...current, [field]: true }))

  const save = async () => {
    if (!parsed?.success) {
      setTouched({ accountName: true, bankCode: true, accountNumber: true })
      return
    }
    setServerError(null)
    const result = await setPayoutAccount({ input: parsed.data })
    if (!result.data?.setPayoutAccount) {
      setServerError(result.error?.graphQLErrors[0]?.message ?? 'Couldn’t save your bank account. Please try again.')
      return
    }
    toast('Bank account saved')
    onDone()
  }

  return (
    <>
      <Field label="Account holder" hint="The name on the bank account. It must be your own name." error={errorFor('accountName')}>
        <Input
          value={accountName}
          onChangeText={setAccountName}
          onBlur={() => touch('accountName')}
          maxLength={90}
          autoComplete="name"
          accessibilityLabel="Account holder"
          invalid={Boolean(errorFor('accountName'))}
        />
      </Field>
      <Field label="Bank" error={errorFor('bankCode')}>
        {banks ? (
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Bank">
            {banks.map((bank) => (
              <Chip
                key={bank.code}
                label={bank.name}
                subtle
                selected={bankCode === bank.code}
                onPress={() => {
                  setBankCode(bank.code)
                  touch('bankCode')
                }}
              />
            ))}
          </View>
        ) : banksFailed ? (
          <View style={styles.inlineError}>
            <Txt variant="small" style={{ color: c.danger }} accessibilityRole="alert">
              Couldn’t load the list of banks.
            </Txt>
            <Button label="Try again" tone="ghost" size="sm" onPress={onRetryBanks} />
          </View>
        ) : (
          <View style={styles.chips} accessibilityElementsHidden>
            <Skeleton width={64} height={28} style={{ borderRadius: radius.pill }} />
            <Skeleton width={96} height={28} style={{ borderRadius: radius.pill }} />
            <Skeleton width={80} height={28} style={{ borderRadius: radius.pill }} />
          </View>
        )}
      </Field>
      <Field label="Account number" hint="Digits only, as it appears on your statement." error={errorFor('accountNumber')}>
        <Input
          value={accountNumber}
          onChangeText={setAccountNumber}
          onBlur={() => touch('accountNumber')}
          keyboardType="number-pad"
          autoComplete="off"
          autoCorrect={false}
          maxLength={24}
          accessibilityLabel="Account number"
          invalid={Boolean(errorFor('accountNumber'))}
        />
      </Field>
      {serverError ? (
        <Txt variant="small" style={{ color: c.danger }} accessibilityRole="alert">
          {serverError}
        </Txt>
      ) : null}
      <View style={styles.formActions}>
        <Button label="Save account" loading={fetching} onPress={() => void save()} />
        <Button label="Cancel" tone="ghost" disabled={fetching} onPress={onDone} />
      </View>
    </>
  )
}

function DeleteAccount({ handle, heldBountyIds }: { handle: string; heldBountyIds: string[] }) {
  const router = useRouter()
  const toast = useToast()
  const { signOut } = useAuth()
  const [, deleteAccount] = useMutation(DeleteAccountMutation)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const confirmed = typed.trim().replace(/^@/, '').toLowerCase() === handle
  const held = heldBountyIds.length > 0

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
          Permanently delete your account and everything you’ve shared on CIVIC/ONE. If CIVIC/ONE is holding money for a bounty you posted, or paying out a claim
          you made, finish or cancel it first.
        </Txt>
        {held ? <HeldBounties ids={heldBountyIds} /> : null}
        <View style={styles.formActions}>
          <Button label="Delete account" tone="outline" icon="trash" disabled={held} onPress={() => setOpen(true)} />
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
      {held ? <HeldBounties ids={heldBountyIds} /> : null}
      <View style={{ gap: 6 }}>
        <Txt variant="label">Type @{handle} to confirm</Txt>
        <Input value={typed} onChangeText={setTyped} placeholder={`@${handle}`} autoCapitalize="none" autoCorrect={false} accessibilityLabel={`Type @${handle} to confirm`} />
      </View>
      <View style={styles.formActions}>
        <Button label="Delete my account" tone="danger" icon="trash" loading={deleting} disabled={!confirmed || held} onPress={() => void remove()} />
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

/** The bounties CIVIC/ONE still holds money for, which block deletion until they close. */
function HeldBounties({ ids }: { ids: string[] }) {
  const c = useColors()
  return (
    <View style={[styles.held, { backgroundColor: c.warningTint }]} accessibilityRole="summary">
      <View style={styles.heldHead}>
        <Icon name="bounty" size={15} color={c.warning} />
        <Txt variant="small" style={{ flex: 1, color: c.text }}>
          We’re holding money for {ids.length} of your bounties. Cancel them or wait for payouts and refunds to finish, then delete your account.
        </Txt>
      </View>
      {ids.map((id) => (
        <HoverLink key={id} href={`/bounties/${id}`} accessibilityRole="link" accessibilityLabel={`Bounty ${id.slice(0, 8)}`} style={styles.heldLink} hoverStyle={{ opacity: 0.7 }}>
          <Txt variant="smallStrong" style={{ color: c.accentText }}>
            Bounty {id.slice(0, 8)}
          </Txt>
          <Icon name="arrowRight" size={14} color={c.accentText} />
        </HoverLink>
      ))}
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
  inlineError: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  note: { paddingHorizontal: 18, paddingTop: 12 },
  notes: { gap: 8, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  held: { padding: 12, borderRadius: radius.sm, gap: 8 },
  heldHead: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  heldLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, alignSelf: 'flex-start' },
})
