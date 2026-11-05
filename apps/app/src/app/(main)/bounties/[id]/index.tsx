import { BOUNTY_CLOSED_STATUSES, BOUNTY_LISTED_STATUSES, CLAIM_LIVE_STATUSES, formatZar, PREVIEW_PAGES } from '@civic/core'
import type { BountyDetailFieldsFragment, BountyMetadataQuery as BountyMetadata } from '@civic/graphql'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { ImmutableRequest } from 'expo-router/server'
import { useState } from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useQuery } from 'urql'
import { ActivityTrail } from '@/components/bounties/ActivityTrail'
import { AdminCard } from '@/components/bounties/AdminCard'
import { BountyMenu, bountyUrl, ShareButton } from '@/components/bounties/BountyMenu'
import { ClaimCard } from '@/components/bounties/ClaimCard'
import { ManageCard } from '@/components/bounties/ManageCard'
import { StatusStrip } from '@/components/bounties/StatusStrip'
import { useCompose } from '@/components/ComposeProvider'
import { HoverLink } from '@/components/HoverLink'
import { Icon } from '@/components/Icon'
import { JsonLd } from '@/components/JsonLd'
import { MessageButton } from '@/components/messages/MessageButton'
import { RichText } from '@/components/RichText'
import { PageHeader, Screen } from '@/components/Screen'
import { Button, Card, EmptyState, PostSkeleton, Row, Txt } from '@/components/ui'
import { UserRow } from '@/components/UserRow'
import { BountyMetadataQuery, BountyQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { formatDate, kindLabel } from '@/lib/bounty-copy'
import { useHydrate } from '@/lib/graphql/hydrate'
import { prefetch } from '@/lib/graphql/prefetch'
import { useIsAdmin } from '@/lib/payments'
import { excerpt, pageMetadata } from '@/lib/seo'
import { useRequireAuth } from '@/lib/use-require-auth'
import { bountyVariables, param } from '@/lib/variables'
import { brand, fonts, radius, useColors } from '@/theme'

type Bounty = BountyDetailFieldsFragment

export function loader(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  return prefetch((fetch) => fetch(BountyQuery, bountyVariables(param(params.id))))
}

/** Missing-person bounties keep their text out of titles, previews and structured data: the page says "missing person", not who. */
const description = (bounty: { kind: string; body: string }) => (bounty.kind === 'MISSING_PERSON' ? PREVIEW_PAGES.bounties.description : excerpt(bounty.body))
const headline = (bounty: { kind: string; title: string; amountCents: number }) => `${formatZar(bounty.amountCents)} bounty · ${bounty.kind === 'MISSING_PERSON' ? 'Missing person, SAPS case open' : excerpt(bounty.title, 60)}`

export async function generateMetadata(_request: ImmutableRequest | undefined, params: Record<string, string | string[]>) {
  const id = param(params.id)
  const path = `/bounties/${id}`
  let bounty: BountyMetadata['bounty'] | undefined
  await prefetch(async (fetch) => {
    // The loader runs next and asks for BountyQuery; starting it now means it doesn't wait.
    const [metadata] = await Promise.all([fetch(BountyMetadataQuery, { id }), fetch(BountyQuery, bountyVariables(id))])
    bounty = metadata?.bounty
  })
  if (!bounty) return pageMetadata({ title: 'Bounty not found', path, noindex: true })
  return pageMetadata({
    title: headline(bounty),
    description: description(bounty),
    path,
    type: 'article',
    image: bounty.previewImage,
    noindex: !BOUNTY_LISTED_STATUSES.includes(bounty.status),
  })
}

export default function BountyScreen() {
  useHydrate()
  const router = useRouter()
  const { status: auth } = useAuth()
  const admin = useIsAdmin()
  const params = useLocalSearchParams<{ id: string; live?: string; review?: string }>()
  const id = param(params.id)
  const [{ data, fetching }] = useQuery({ query: BountyQuery, variables: bountyVariables(id) })
  const bounty = data?.bounty ?? null
  const Body = Platform.OS === 'web' ? View : ScrollView

  return (
    <Screen
      title={bounty ? headline(bounty) : 'Bounty'}
      header={<PageHeader title="Bounty" back right={bounty ? <BountyMenu bounty={bounty} poster={bounty.viewerIsPoster} signedIn={auth === 'signed-in'} /> : undefined} />}
    >
      {bounty ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: headline(bounty),
            description: description(bounty),
            datePublished: bounty.createdAt,
          }}
        />
      ) : null}
      <Body>
        {bounty ? (
          <BountyDetail bounty={bounty} admin={admin} signedIn={auth === 'signed-in'} signedOut={auth === 'signed-out'} live={param(params.live) === '1'} review={param(params.review) === '1'} />
        ) : fetching || auth === 'loading' ? (
          <PostSkeleton />
        ) : (
          <EmptyState
            icon="bounty"
            title="This bounty isn’t available"
            body="It may have been removed, or it isn’t public yet."
            action={<Button label="Back to bounties" tone="outline" onPress={() => router.replace('/bounties')} />}
          />
        )}
      </Body>
    </Screen>
  )
}

function rewardLine(status: Bounty['status']): string {
  switch (status) {
    case 'PAID':
      return 'Paid to the person who honoured it'
    case 'CANCELLED':
    case 'EXPIRED':
      return 'Refunded to the poster'
    case 'PENDING_PAYMENT':
    case 'ABANDONED':
      return 'Not paid in yet'
    default:
      return 'Reward, held by CIVIC/ONE until the bounty is honoured'
  }
}

/** The date that matters for where the bounty is: when it was honoured, closed, or ends. */
function whenRow(bounty: Bounty): { label: string; value: string } | null {
  if (bounty.status === 'PAID' && bounty.closedAt) return { label: 'Honoured', value: formatDate(bounty.closedAt) }
  if (BOUNTY_CLOSED_STATUSES.includes(bounty.status) && bounty.closedAt) return { label: 'Closed', value: formatDate(bounty.closedAt) }
  if (bounty.expiresAt) return { label: bounty.isExpired ? 'Ended' : 'Ends', value: formatDate(bounty.expiresAt) }
  return null
}

function BountyDetail({ bounty, admin, signedIn, signedOut, live, review }: { bounty: Bounty; admin: boolean; signedIn: boolean; signedOut: boolean; live: boolean; review: boolean }) {
  const c = useColors()
  const router = useRouter()
  const gate = useRequireAuth()
  const { openCompose } = useCompose()
  const [dismissed, setDismissed] = useState<{ live?: boolean; review?: boolean }>({})
  const poster = bounty.viewerIsPoster
  const claim = bounty.viewerClaim
  const liveClaim = claim !== null && CLAIM_LIVE_STATUSES.includes(claim.status)
  const amount = formatZar(bounty.amountCents)
  const when = whenRow(bounty)
  const listed = BOUNTY_LISTED_STATUSES.includes(bounty.status)
  const canClaim = bounty.status === 'OPEN' && !bounty.isExpired && !poster && !liveClaim
  const paused = (bounty.status === 'AWAITING_VERIFICATION' || bounty.status === 'RELEASING') && !poster && !liveClaim
  const closedToClaims = bounty.status === 'OPEN' && bounty.isExpired && !poster && !liveClaim

  const dismiss = (key: 'live' | 'review') => {
    setDismissed((state) => ({ ...state, [key]: true }))
    router.setParams({ [key]: undefined })
  }

  const shareAsUpdate = () => {
    dismiss('live')
    openCompose({ initialBody: `${amount} bounty: ${bounty.title}. Details and how to claim: ${bountyUrl(bounty.id)} #Bounty` })
  }

  return (
    <View style={styles.page}>
      <StatusStrip bounty={bounty} poster={poster} admin={admin} />

      <View style={styles.block}>
        <Txt style={[styles.amount, { color: c.text }]} accessibilityLabel={`${amount} reward`}>
          {amount}
        </Txt>
        <Txt variant="small" color="textMuted">
          {rewardLine(bounty.status)}
        </Txt>
      </View>

      <View style={[styles.block, { gap: 10 }]}>
        <View style={[styles.pill, { borderColor: c.line }]}>
          <Txt variant="micro">{kindLabel(bounty.kind)}</Txt>
        </View>
        <Txt variant="title" accessibilityRole="header">
          {bounty.title}
        </Txt>
        <RichText body={bounty.body} style={styles.body} />
      </View>

      {bounty.kind === 'MISSING_PERSON' ? (
        <Card tone="inverse" style={styles.banner}>
          <Icon name="siren" size={18} color={brand.coral} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="bodyStrong" style={{ color: c.onInverse }}>
              If you see this person, call 10111 now and give the case number{bounty.sapsCaseNumber ? ` ${bounty.sapsCaseNumber}` : ''}.
            </Txt>
            <Txt variant="small" style={{ color: c.onInverseMuted }}>
              Don’t approach them, don’t post where they are, and don’t message the poster with a location. Afterwards, you can submit a claim here saying which station you
              spoke to.
            </Txt>
          </View>
        </Card>
      ) : null}

      <View style={[styles.facts, { borderTopColor: c.line, borderBottomColor: c.line }]}>
        {bounty.area ? <Row label="Area" value={bounty.area} /> : null}
        <Row label="Posted" value={formatDate(bounty.createdAt)} />
        {when ? <Row label={when.label} value={when.value} /> : null}
        {bounty.sapsCaseNumber ? (
          <Row label="SAPS case" value={bounty.sapsCaseNumber} />
        ) : signedOut && bounty.kind !== 'MISSING_PERSON' ? (
          <Row label="SAPS case">
            <Txt variant="small" color="textMuted">
              Sign in to see the case number
            </Txt>
          </Row>
        ) : null}
        {bounty.post ? (
          <Row label="Linked update">
            <HoverLink href={`/post/${bounty.post.id}`} accessibilityLabel="Open the linked update" style={{ alignSelf: 'flex-start' }} hoverStyle={{ opacity: 0.8 }}>
              <Txt variant="small" style={{ color: c.accentText, fontFamily: fonts.semibold }}>
                {excerpt(bounty.post.body, 90)}
              </Txt>
            </HoverLink>
          </Row>
        ) : null}
        {bounty.claimCount > 0 ? <Row label="Claims" value={listed && bounty.status !== 'PAID' ? `${bounty.claimCount} under review` : `${bounty.claimCount} ${bounty.claimCount === 1 ? 'claim' : 'claims'}`} /> : null}
      </View>

      <View style={styles.block}>
        <Txt variant="micro" color="textMuted">
          Posted by
        </Txt>
        {bounty.poster ? (
          <View style={styles.posterRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <UserRow user={bounty.poster} dense />
            </View>
            {bounty.poster.viewerCanMessage ? <MessageButton userId={bounty.poster.id} name={bounty.poster.displayName} /> : null}
          </View>
        ) : (
          <Txt variant="small" color="textMuted">
            Posted by a former member
          </Txt>
        )}
      </View>

      <View style={[styles.notice, { backgroundColor: c.surfaceAlt }]} accessibilityRole="summary">
        <Icon name="siren" size={15} color={c.danger} />
        <Txt variant="small" style={{ flex: 1 }}>
          <Txt variant="smallStrong">Not a police case. </Txt>A bounty on CIVIC/ONE doesn’t replace a SAPS case. If you have information about a crime, give it to SAPS too. In an
          emergency, call 10111, or 112 from a mobile.
        </Txt>
      </View>

      {poster && live && !dismissed.live && bounty.status === 'OPEN' ? (
        <Card style={styles.card}>
          <Txt variant="title" accessibilityRole="header">
            Your bounty is live.
          </Txt>
          <Txt variant="small" color="textMuted">
            Share it as an update so your neighbourhood sees it.
          </Txt>
          <View style={styles.actions}>
            <Button tone="accent" label="Share as an update" icon="send" onPress={shareAsUpdate} />
            <Button tone="ghost" label="Not now" onPress={() => dismiss('live')} />
          </View>
        </Card>
      ) : null}

      {poster && review && !dismissed.review && bounty.status === 'PENDING_REVIEW' ? (
        <Card style={styles.card}>
          <Txt variant="title" accessibilityRole="header">
            We’re reviewing your bounty.
          </Txt>
          <Txt variant="small" color="textMuted">
            We review this kind of bounty before listing it, usually within a day. We’ll notify you here either way. If we can’t list it, the full amount is refunded.
          </Txt>
          <View style={styles.actions}>
            <Button tone="ghost" label="OK" onPress={() => dismiss('review')} />
          </View>
        </Card>
      ) : null}

      {canClaim || listed ? (
        <View style={[styles.block, styles.actions]}>
          {canClaim ? <Button label="I have information" icon="bounty" size="lg" onPress={gate(() => router.push(`/bounties/${bounty.id}/claim`), 'Sign in to claim a bounty')} /> : null}
          {listed ? <ShareButton bounty={bounty} /> : null}
        </View>
      ) : null}
      {paused ? (
        <Txt variant="small" color="textMuted" style={styles.line}>
          A claim is being verified. New claims aren’t being accepted right now.
        </Txt>
      ) : null}
      {closedToClaims ? (
        <Txt variant="small" color="textMuted" style={styles.line}>
          This bounty has closed to new claims.
        </Txt>
      ) : null}

      {claim ? <ClaimCard claim={claim} bounty={bounty} /> : null}
      {poster && bounty.status !== 'PENDING_PAYMENT' && bounty.status !== 'ABANDONED' ? <ManageCard bounty={bounty} /> : null}
      {admin && signedIn ? <AdminCard bounty={bounty} /> : null}

      <ActivityTrail events={bounty.events} />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { paddingBottom: 32 },
  block: { paddingHorizontal: 18, paddingVertical: 14, gap: 4 },
  amount: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -1 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  body: { fontSize: 18, lineHeight: 27 },
  banner: { marginHorizontal: 18, marginBottom: 6, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  facts: { marginTop: 6, paddingVertical: 4, borderTopWidth: 1, borderBottomWidth: 1 },
  posterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notice: { marginHorizontal: 18, marginBottom: 6, padding: 12, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  card: { marginHorizontal: 18, marginVertical: 8, padding: 16, gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  line: { paddingHorizontal: 18, paddingVertical: 10 },
})
