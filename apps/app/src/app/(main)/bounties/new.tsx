import {
  BOUNTY_BODY_MAX,
  BOUNTY_DEFAULT_DURATION_DAYS,
  BOUNTY_DURATIONS_DAYS,
  BOUNTY_KIND_RULES,
  BOUNTY_MAX_CENTS,
  BOUNTY_MIN_CENTS,
  BOUNTY_TITLE_MAX,
  type BountyKind,
  checkPrivacy,
  formatZar,
} from '@civic/core'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useMutation } from 'urql'
import { ComingSoon } from '@/components/bounties/ComingSoon'
import { KindChips } from '@/components/bounties/KindChips'
import { Icon } from '@/components/Icon'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Button, Checkbox, Chip, EmptyState, Field, Input, Row, Section, Skeleton, Txt } from '@/components/ui'
import { CreateBounty } from '@/graphql/documents'
import { apiIssues, apiMessage } from '@/lib/api-errors'
import { useAuth } from '@/lib/auth'
import { openCheckout } from '@/lib/checkout'
import { usePaymentsStatus } from '@/lib/payments'
import { useSchemas } from '@/lib/schemas'
import { pageMetadata } from '@/lib/seo'
import { param } from '@/lib/variables'
import { fonts, radius, useColors } from '@/theme'

export function generateMetadata() {
  return pageMetadata({ title: 'Post a bounty', path: '/bounties/new', noindex: true })
}

const AREA_MAX = 60
const CASE_NUMBER_MAX = 40

type Relationship = 'parent' | 'guardian' | 'family' | 'partner'

const RELATIONSHIPS: Array<{ value: Relationship; label: string }> = [
  { value: 'parent', label: 'Parent' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'family', label: 'Family' },
  { value: 'partner', label: 'Partner' },
]

const BEFORE_YOU_PAY = [
  'You can cancel while nobody has sent a claim, and the full amount is refunded.',
  'Payment is released only after you confirm a claim, a waiting period passes, and CIVIC/ONE verifies it.',
  'Refunds go back to the card you paid with, usually within a few working days.',
]

export default function NewBountyScreen() {
  const { status } = useAuth()
  const Body = Platform.OS === 'web' ? View : ScrollView

  return (
    <Screen title="Post a bounty" header={<PageHeader title="Post a bounty" subtitle="A reward, held by CIVIC/ONE, for a verifiable outcome" back />}>
      <Body>{status === 'signed-in' ? <Gate /> : status === 'signed-out' ? <SignedOut /> : <LoadingRows />}</Body>
    </Screen>
  )
}

/** Nothing that would take money is shown until payments are known to be on. */
function Gate() {
  const router = useRouter()
  const payments = usePaymentsStatus()
  if (payments.known && !payments.enabled) {
    return (
      <View>
        <ComingSoon />
        <View style={styles.actions}>
          <Button label="How bounties will work" tone="outline" icon="bounty" onPress={() => router.push('/bounties/rules')} />
        </View>
      </View>
    )
  }
  return <BountyForm sandbox={payments.sandbox} />
}

function BountyForm({ sandbox }: { sandbox: boolean }) {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const linkedPostId = param(useLocalSearchParams<{ postId?: string }>().postId)
  const [{ fetching }, createBounty] = useMutation(CreateBounty)
  const schemas = useSchemas()

  const [kind, setKind] = useState<BountyKind>('PROPERTY')
  const [relationship, setRelationship] = useState<Relationship | null>(null)
  const [guardian, setGuardian] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [area, setArea] = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [rands, setRands] = useState('')
  const [durationDays, setDurationDays] = useState<number>(BOUNTY_DEFAULT_DURATION_DAYS)
  const [terms, setTerms] = useState(false)
  const [postId, setPostId] = useState(linkedPostId)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverIssues, setServerIssues] = useState<Record<string, string>>({})

  const rules = BOUNTY_KIND_RULES[kind]
  const missing = kind === 'MISSING_PERSON'
  const amountCents = /^\d+$/.test(rands) ? Number(rands) * 100 : Number.NaN
  const durations = BOUNTY_DURATIONS_DAYS.filter((days) => days <= rules.maxDays)

  // The same rules the API applies, so the button only lights up for a bounty it will accept.
  const parsed = schemas?.createBountySchema.safeParse({
    kind,
    title,
    body,
    area: area || null,
    amountCents,
    durationDays,
    sapsCaseNumber: caseNumber || null,
    postId: postId || null,
    relationship: missing ? relationship : null,
    termsAccepted: terms,
  })
  const issues = !parsed || parsed.success ? [] : parsed.error.issues
  const valid = Boolean(parsed?.success) && (!missing || guardian)

  const findings = useMemo(() => checkPrivacy(body), [body])
  const danger = findings.some((finding) => finding.level === 'danger')

  const touch = (field: string) => () => setTouched((current) => ({ ...current, [field]: true }))

  /**
   * What to say under a field: the API's own issue first; otherwise the schema's,
   * straight away for a content rule on something typed (a mention, a case number
   * that doesn't look like one) and only once the field has been left for the rest.
   */
  const errorFor = (field: string, value: string, immediate = false): string | null => {
    const fromServer = serverIssues[field]
    if (fromServer) return fromServer
    const matching = issues.filter((candidate) => candidate.path[0] === field)
    const issue = matching.find((candidate) => candidate.code === 'custom') ?? matching[0]
    if (!issue) return null
    if (value.length === 0 && issue.code !== 'custom') return null
    return immediate || touched[field] || (issue.code === 'custom' && value.length > 0) ? issue.message : null
  }

  const chooseKind = (next: BountyKind | null) => {
    if (!next) return
    setKind(next)
    if (durationDays > BOUNTY_KIND_RULES[next].maxDays) setDurationDays(BOUNTY_DEFAULT_DURATION_DAYS)
  }

  const submit = async () => {
    setServerError(null)
    setServerIssues({})
    const result = await createBounty({
      input: {
        kind,
        title: title.trim(),
        body: body.trim(),
        area: area.trim() || null,
        amountCents,
        durationDays,
        sapsCaseNumber: caseNumber.trim() || null,
        postId: postId || null,
        relationship: missing ? relationship : null,
        termsAccepted: true,
      },
    })
    if (result.error || !result.data) {
      setServerError(apiMessage(result.error, 'We couldn’t create the bounty right now. Try again.'))
      setServerIssues(apiIssues(result.error))
      return
    }
    const { bounty, checkoutUrl } = result.data.createBounty
    if (checkoutUrl) {
      try {
        await openCheckout(router, bounty.id, checkoutUrl)
        return
      } catch {
        // The provider page didn't open (a malformed URL, or the native session failed). The bounty exists and can be paid from its page.
      }
    }
    toast('We couldn’t open the payment page. Try again from the bounty.')
    router.replace(`/bounties/${bounty.id}`)
  }

  const linkStyle = { color: c.accentText, fontFamily: fonts.semibold }
  const amount = Number.isFinite(amountCents) ? formatZar(amountCents) : 'the reward'
  const titleError = errorFor('title', title)
  const bodyError = errorFor('body', body)
  const amountError = errorFor('amountCents', rands)
  const caseNumberError = errorFor('sapsCaseNumber', caseNumber)
  const postError = postId ? errorFor('postId', postId, true) : null

  return (
    <View>
      <Section title="What is this bounty for?">
        <View style={styles.group}>
          <KindChips value={kind} onChange={chooseKind} />
          <Txt variant="small" color="textMuted">
            {rules.fulfilled}
          </Txt>
          {missing ? (
            <View style={[styles.notice, { backgroundColor: c.warningTint }]}>
              <View style={styles.noticeRow}>
                <Icon name="shield" size={15} color={c.warning} />
                <Txt variant="small" style={{ flex: 1, color: c.text }}>
                  <Txt variant="smallStrong">Extra care for missing people. </Txt>
                  Only a parent, legal guardian, adult family member or partner may post this, and only once SAPS has been told. We review missing-person
                  bounties before they go public, and we won’t list one that could put someone at risk — including people who may have left a violent home.
                </Txt>
              </View>
              <View style={{ gap: 6 }}>
                <Txt variant="label">How do you know them?</Txt>
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="How you know the person">
                  {RELATIONSHIPS.map((option) => (
                    <Chip key={option.value} label={option.label} selected={relationship === option.value} onPress={() => setRelationship(option.value)} />
                  ))}
                </View>
              </View>
              <Checkbox
                checked={guardian}
                onChange={setGuardian}
                label="I’m this person’s parent or legal guardian, adult family member or partner. SAPS has been told. No protection order prevents me from contacting them, and I’ll tell CIVIC/ONE as soon as they’re found."
              />
            </View>
          ) : null}
        </View>
      </Section>

      <Section title="Details">
        {postId ? (
          <Row label="Linked update" value={`${postId.slice(0, 8)}…`} hint="The bounty is attached to your update, so people who see the update see the reward.">
            {postError ? (
              <Txt variant="small" style={{ color: c.danger }} accessibilityRole="alert">
                {postError}
              </Txt>
            ) : null}
            <View style={styles.inlineActions}>
              <Button label="Unlink" tone="ghost" size="sm" icon="close" onPress={() => setPostId('')} />
            </View>
          </Row>
        ) : null}
        <View style={styles.group}>
          <Field label="Title" count={`${title.length}/${BOUNTY_TITLE_MAX}`} over={title.length > BOUNTY_TITLE_MAX} error={titleError}>
            <Input
              value={title}
              onChangeText={setTitle}
              onBlur={touch('title')}
              maxLength={BOUNTY_TITLE_MAX + 10}
              placeholder={rules.titlePlaceholder}
              accessibilityLabel="Title"
              invalid={Boolean(titleError)}
            />
          </Field>
          <Field
            label="What happened, and what counts as honouring the bounty?"
            count={`${body.length}/${BOUNTY_BODY_MAX}`}
            over={body.length > BOUNTY_BODY_MAX}
            hint={missing ? 'Name, age, when and where last seen, what they were wearing. No home address, no school, no routine, no ID number.' : undefined}
            error={bodyError}
          >
            <Input
              value={body}
              onChangeText={setBody}
              onBlur={touch('body')}
              multiline
              maxLength={BOUNTY_BODY_MAX + 100}
              placeholder={rules.bodyPlaceholder}
              accessibilityLabel="What happened, and what counts as honouring the bounty"
              invalid={Boolean(bodyError)}
              style={styles.bodyInput}
            />
          </Field>

          {findings.length ? (
            <View style={[styles.findings, { backgroundColor: danger ? c.dangerTint : c.warningTint }]} accessibilityLiveRegion="polite">
              {findings.map((finding) => (
                <View key={`${finding.kind}-${finding.start}`} style={styles.noticeRow}>
                  <Icon name={finding.level === 'danger' ? 'lock' : 'shield'} size={15} color={finding.level === 'danger' ? c.danger : c.warning} />
                  <Txt variant="small" style={{ flex: 1, color: c.text }}>
                    <Txt variant="smallStrong">“{body.slice(finding.start, finding.end)}”</Txt> — {finding.message}
                  </Txt>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.findings, { backgroundColor: c.accentTint }]}>
              <View style={styles.noticeRow}>
                <Icon name="shield" size={15} color={c.accentTintText} />
                <Txt variant="small" style={{ flex: 1, color: c.accentTintText }}>
                  <Txt variant="smallStrong" style={{ color: c.accentTintText }}>
                    What a bounty can be for.{' '}
                  </Txt>
                  Recovery, a safe return, or information you’ll hand to SAPS. Don’t name or describe a suspect, and don’t ask people to find someone. We review
                  bounties that do, and remove them.
                </Txt>
              </View>
            </View>
          )}

          <Field label="Area" hint="Optional. A suburb or town, not a street address." error={errorFor('area', area)}>
            <Input value={area} onChangeText={setArea} maxLength={AREA_MAX} placeholder="Woodstock, Cape Town" accessibilityLabel="Area" />
          </Field>
          <Field
            label="SAPS case number"
            hint={rules.requiresCaseNumber ? `A ${rules.label.toLowerCase()} bounty needs an open SAPS case. Report it first, then post.` : 'Optional. It helps claimants and our reviewers.'}
            error={caseNumberError}
          >
            <Input
              value={caseNumber}
              onChangeText={setCaseNumber}
              onBlur={touch('sapsCaseNumber')}
              maxLength={CASE_NUMBER_MAX}
              placeholder="CAS 123/11/2026"
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="SAPS case number"
              invalid={Boolean(caseNumberError)}
            />
          </Field>
        </View>
      </Section>

      <Section title="Reward">
        <View style={styles.group}>
          <Field label="Amount" hint={`Between ${formatZar(BOUNTY_MIN_CENTS)} and ${formatZar(BOUNTY_MAX_CENTS)}.`} error={amountError}>
            <View style={styles.amountRow}>
              <Txt variant="title" accessibilityElementsHidden>
                R
              </Txt>
              <Input
                value={rands}
                onChangeText={(text) => setRands(text.replace(/\D/g, ''))}
                onBlur={touch('amountCents')}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={6}
                placeholder="5000"
                accessibilityLabel="Reward in rands"
                invalid={Boolean(amountError)}
                style={{ flex: 1 }}
              />
            </View>
          </Field>
          <Field label="Open for" hint="If nobody honours the bounty by then, the full amount is refunded to you." error={errorFor('durationDays', String(durationDays), true)}>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Open for">
              {durations.map((days) => (
                <Chip key={days} label={`${days} days`} selected={durationDays === days} onPress={() => setDurationDays(days)} />
              ))}
            </View>
          </Field>
          <View style={[styles.findings, { backgroundColor: c.surfaceAlt }]}>
            <View style={styles.noticeRow}>
              <Icon name="bounty" size={15} color={c.text} />
              <Txt variant="small" style={{ flex: 1 }}>
                You pay {amount} now. CIVIC/ONE holds it. It’s paid to the person who honours the bounty once you confirm and we verify, or refunded to you if the
                bounty expires or you cancel it. No CIVIC/ONE fee.
              </Txt>
            </View>
          </View>
        </View>
      </Section>

      <Section title="Before you pay">
        <View style={styles.group}>
          <View style={{ gap: 8 }}>
            {BEFORE_YOU_PAY.map((line) => (
              <View key={line} style={styles.bullet}>
                <Icon name="check" size={16} color={c.accentText} />
                <Txt variant="small" style={{ flex: 1 }}>
                  {line}
                </Txt>
              </View>
            ))}
          </View>
          <Checkbox
            checked={terms}
            onChange={setTerms}
            label="I’m the owner or victim, or immediate family. This is reported to SAPS. CIVIC/ONE will hold my payment and pay it only to a claim I confirm and CIVIC/ONE verifies, or refund me. I’ve read the bounty rules and the terms."
          />
          <Txt variant="small" color="textMuted" style={styles.links}>
            <Link href="/bounties/rules" style={linkStyle}>
              Bounty rules
            </Link>
            {' · '}
            <Link href="/terms" style={linkStyle}>
              Terms of use
            </Link>
          </Txt>
          <View style={styles.submit}>
            <Button label="Continue to payment" icon="arrowRight" size="lg" disabled={!valid} loading={fetching} onPress={() => void submit()} />
            <Txt variant="small" color="textMuted">
              {sandbox ? 'Sandbox: no real money moves.' : 'You’ll be sent to Paystack to pay; we never see your card.'}
            </Txt>
            {serverError ? (
              <Txt variant="small" style={{ color: c.danger }} accessibilityRole="alert">
                {serverError}
              </Txt>
            ) : null}
          </View>
        </View>
      </Section>
    </View>
  )
}

function SignedOut() {
  const router = useRouter()
  return (
    <EmptyState
      icon="lock"
      title="Sign in to post a bounty"
      body="You’ll need an account so we can hold your reward and return it if nothing comes of it."
      action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />}
    />
  )
}

function LoadingRows() {
  return (
    <View style={[styles.group, { gap: 14 }]} accessibilityElementsHidden>
      <Skeleton width="40%" />
      <Skeleton width="90%" />
      <Skeleton width="70%" />
      <Skeleton width="55%" />
    </View>
  )
}

const styles = StyleSheet.create({
  group: { gap: 16, paddingHorizontal: 18, paddingVertical: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 18, paddingVertical: 14 },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  notice: { padding: 12, borderRadius: radius.sm, gap: 12 },
  noticeRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  findings: { padding: 12, borderRadius: radius.sm, gap: 8 },
  bodyInput: { minHeight: 150 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bullet: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  links: { paddingLeft: 32 },
  submit: { gap: 10, paddingTop: 4 },
})
