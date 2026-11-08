import { BOUNTY_KIND_RULES, CLAIM_BODY_MAX, CLAIM_BODY_MIN, CLAIM_LINKS_MAX, CLAIM_POSTER_RESPONSE_DAYS, checkPrivacy, formatZar, PAYOUT_ACCOUNT_HOLD_HOURS } from '@civic/core'
import type { BountyDetailFieldsFragment } from '@civic/graphql'
import { Link, useLocalSearchParams, useRouter } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { useMemo, useState } from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useMutation, useQuery } from 'urql'
import { Icon } from '@/components/Icon'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Button, Checkbox, EmptyState, Field, Input, Section, Skeleton, Txt } from '@/components/ui'
import { BountyQuery, PayoutSettingsQuery, SubmitClaim } from '@/graphql/documents'
import { apiIssues, apiMessage } from '@/lib/api-errors'
import { useAuth } from '@/lib/auth'
import { useSchemas } from '@/lib/schemas'
import { pageMetadata } from '@/lib/seo'
import { bountyVariables, param } from '@/lib/variables'
import { fonts, radius, useColors } from '@/theme'

export function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  return pageMetadata({ title: 'Claim this bounty', path: `/bounties/${param(params.id)}/claim`, noindex: true })
}

export default function ClaimScreen() {
  const router = useRouter()
  const { status } = useAuth()
  const id = param(useLocalSearchParams<{ id: string }>().id)
  const [{ data, fetching, error }] = useQuery({ query: BountyQuery, variables: bountyVariables(id), pause: status !== 'signed-in' })
  // A claim needs somewhere for the money to go: the API refuses one without a bank account, so the form asks first.
  const [payout] = useQuery({ query: PayoutSettingsQuery, pause: status !== 'signed-in' })
  const bounty = data?.bounty
  const Body = Platform.OS === 'web' ? View : ScrollView
  const back = <Button label="Back to the bounty" tone="outline" onPress={() => router.replace(`/bounties/${id}`)} />

  const content = () => {
    if (status === 'loading') return <LoadingRows />
    if (status === 'signed-out') {
      return (
        <EmptyState
          icon="lock"
          title="Sign in to claim a bounty"
          body="CIVIC/ONE’s reviewers check every claim before the poster sees it, and the reward is paid to the bank account of the person who sends it."
          action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />}
        />
      )
    }
    if (!data && fetching) return <LoadingRows />
    if (!data && error) return <EmptyState icon="globe" title="Can’t reach CIVIC/ONE" body="Check your connection and try again." />
    if (!bounty) {
      return (
        <EmptyState
          icon="bounty"
          title="This bounty isn’t available"
          body="It may have been removed, or it isn’t public yet."
          action={<Button label="Back to bounties" tone="outline" onPress={() => router.replace('/bounties')} />}
        />
      )
    }
    if (bounty.viewerIsPoster) {
      return <EmptyState icon="bounty" title="You can’t claim your own bounty." body="Claims come from the people who recover property, find someone or hand information to SAPS." action={back} />
    }
    if (bounty.status !== 'OPEN' || bounty.isExpired) {
      return <EmptyState icon="bounty" title="This bounty isn’t taking claims" body="It’s under review, or it has closed." action={back} />
    }
    if (bounty.viewerClaim) {
      return (
        <EmptyState
          icon="bounty"
          title="You’ve already claimed this bounty"
          body="A bounty can be claimed once per person. You can follow your claim from the bounty."
          action={<Button label="See your claim" onPress={() => router.replace(`/bounties/${id}`)} />}
        />
      )
    }
    if (!payout.data && payout.fetching) return <LoadingRows />
    if (payout.data && !payout.data.viewer?.payoutAccount) {
      return (
        <EmptyState
          icon="bounty"
          title="Add your bank account first"
          body={`The reward is paid into a South African bank account in your own name, so you need one before you claim. A new account can be paid ${PAYOUT_ACCOUNT_HOLD_HOURS} hours after you add it, which is shorter than the time a claim takes to decide.`}
          action={<Button label="Add a bank account" icon="settings" onPress={() => router.push('/settings')} />}
        />
      )
    }
    return <ClaimForm bounty={bounty} />
  }

  return (
    <Screen title="Claim this bounty" header={<PageHeader title="Claim this bounty" subtitle={bounty ? `${formatZar(bounty.amountCents)} · ${bounty.title}` : undefined} back />}>
      <Body>{content()}</Body>
    </Screen>
  )
}

function ClaimForm({ bounty }: { bounty: BountyDetailFieldsFragment }) {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const [{ fetching }, submitClaim] = useMutation(SubmitClaim)
  const schemas = useSchemas()
  const [body, setBody] = useState('')
  const [linksText, setLinksText] = useState('')
  const [attested, setAttested] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverIssues, setServerIssues] = useState<Record<string, string>>({})

  const rules = BOUNTY_KIND_RULES[bounty.kind]
  const missing = bounty.kind === 'MISSING_PERSON'
  const links = linksText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  // The same rules the API applies, so the button only lights up for a claim it will accept.
  const parsed = schemas?.submitClaimSchema.safeParse({ body, links, attested })
  const issues = !parsed || parsed.success ? [] : parsed.error.issues
  const findings = useMemo(() => checkPrivacy(body, 'private'), [body])
  const danger = findings.some((finding) => finding.level === 'danger')
  const cooldownDays = rules.cooldownHours / 24

  const touch = (field: string) => () => setTouched((current) => ({ ...current, [field]: true }))

  /** The API's own issue first; otherwise the schema's, once the field has been left (or straight away for the links, which are a format rule). */
  const errorFor = (field: string, value: string, immediate = false): string | null => {
    const fromServer = serverIssues[field]
    if (fromServer) return fromServer
    const issue = issues.find((candidate) => candidate.path[0] === field)
    if (!issue || value.length === 0) return null
    return immediate || touched[field] ? issue.message : null
  }

  const submit = async () => {
    setServerError(null)
    setServerIssues({})
    const result = await submitClaim({ bountyId: bounty.id, input: { body: body.trim(), links, attested: true } })
    if (result.error || !result.data) {
      setServerError(apiMessage(result.error, 'We couldn’t send your claim right now. Try again.'))
      setServerIssues(apiIssues(result.error))
      return
    }
    toast('Your claim is with CIVIC/ONE to check')
    router.replace(`/bounties/${bounty.id}`)
  }

  const linkStyle = { color: c.accentText, fontFamily: fonts.semibold }
  const bodyError = errorFor('body', body)
  const linksError = errorFor('links', linksText, true)

  return (
    <View>
      <View style={styles.intro}>
        <Txt variant="small" color="textMuted">
          CIVIC/ONE’s reviewers check your claim first; the poster sees it, and who sent it, only once we approve it. Say what you did, when, and what you handed to SAPS and where. Don’t include anyone’s ID
          number, phone number or address, and don’t name people you suspect.
        </Txt>
        <View style={[styles.findings, { backgroundColor: c.surfaceAlt }]}>
          <View style={styles.noticeRow}>
            <Icon name="bounty" size={15} color={c.text} />
            <Txt variant="small" style={{ flex: 1 }}>
              <Txt variant="smallStrong">What to include. </Txt>
              {rules.evidence}
            </Txt>
          </View>
        </View>
      </View>

      <Section title="Your claim">
        <View style={styles.group}>
          <Field label="What happened" count={`${body.length}/${CLAIM_BODY_MAX}`} over={body.length > CLAIM_BODY_MAX} hint={`At least ${CLAIM_BODY_MIN} characters.`} error={bodyError}>
            <Input
              value={body}
              onChangeText={setBody}
              onBlur={touch('body')}
              multiline
              maxLength={CLAIM_BODY_MAX + 100}
              placeholder="What you did, when, and which SAPS station you went to."
              accessibilityLabel="What happened"
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
          ) : null}

          {missing ? (
            <View style={[styles.findings, { backgroundColor: c.warningTint }]}>
              <View style={styles.noticeRow}>
                <Icon name="siren" size={15} color={c.warning} />
                <Txt variant="small" style={{ flex: 1, color: c.text }}>
                  <Txt variant="smallStrong">Don’t tell us where the person is. </Txt>
                  Call SAPS on 10111 with the case number on the bounty, then say here which station you spoke to.
                </Txt>
              </View>
            </View>
          ) : null}

          <Field label="Links" hint={`Optional. Up to ${CLAIM_LINKS_MAX} https links, one per line.`} error={linksError}>
            <Input
              value={linksText}
              onChangeText={setLinksText}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://"
              accessibilityLabel="Links"
              invalid={Boolean(linksError)}
            />
          </Field>

          <View style={[styles.findings, { backgroundColor: c.warningTint }]}>
            <View style={styles.noticeRow}>
              <Icon name="shield" size={15} color={c.warning} />
              <Txt variant="small" style={{ flex: 1, color: c.text }}>
                <Txt variant="smallStrong">Keep yourself safe. </Txt>
                Don’t confront anyone. If a vehicle or person is in danger right now, call 10111, or 112 from a mobile.
              </Txt>
            </View>
          </View>

          <Checkbox
            checked={attested}
            onChange={setAttested}
            label="I wasn’t involved in this crime. I didn’t buy or receive the item from someone who wasn’t entitled to it. What I describe has been given to SAPS."
          />

          <Txt variant="small" color="textMuted">
            If we approve your claim, a waiting period of {cooldownDays} days starts and the poster has {CLAIM_POSTER_RESPONSE_DAYS} days to confirm it or object. Then the reward is paid to the bank account in{' '}
            <Link href="/settings" style={linkStyle}>
              Settings
            </Link>
            .
          </Txt>

          <View style={styles.submit}>
            <Button label="Send claim" icon="send" size="lg" disabled={!parsed?.success} loading={fetching} onPress={() => void submit()} />
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

function LoadingRows() {
  return (
    <View style={[styles.group, { gap: 14 }]} accessibilityElementsHidden>
      <Skeleton width="40%" />
      <Skeleton width="90%" />
      <Skeleton width="70%" />
    </View>
  )
}

const styles = StyleSheet.create({
  intro: { gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  group: { gap: 16, paddingHorizontal: 18, paddingVertical: 12 },
  noticeRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  findings: { padding: 12, borderRadius: radius.sm, gap: 8 },
  bodyInput: { minHeight: 150 },
  submit: { gap: 10, paddingTop: 4 },
})
