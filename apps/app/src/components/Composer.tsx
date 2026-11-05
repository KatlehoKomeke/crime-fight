import {
  ALERT_SEVERITIES,
  type AlertSeverity,
  canPublishAlerts,
  checkPrivacy,
  POST_MAX_LENGTH,
  type PostKind,
  type UserRole,
} from '@civic/core'
import { useMemo, useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { useMutation, useQuery } from 'urql'
import { CreatePost, ViewerQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { fonts, radius, useColors } from '@/theme'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { Avatar, Button, Chip, Txt } from './ui'

interface Props {
  replyTo?: { id: string; handle: string }
  autoFocus?: boolean
  compact?: boolean
  onPosted?: () => void
}

/**
 * Composer with an on-device privacy guard: personal data is flagged as you
 * type (no network call). It warns and never blocks; the author decides.
 */
export function Composer({ replyTo, autoFocus, compact, onPosted }: Props) {
  const c = useColors()
  const toast = useToast()
  const { status } = useAuth()
  const [{ data: viewerData }] = useQuery({ query: ViewerQuery, pause: status !== 'signed-in' })
  const [{ fetching }, createPost] = useMutation(CreatePost)
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<PostKind>('UPDATE')
  const [severity, setSeverity] = useState<AlertSeverity>('ADVISORY')
  const [serverError, setServerError] = useState<string | null>(null)

  const viewer = viewerData?.viewer
  const official = viewer ? canPublishAlerts(viewer.role as UserRole, viewer.verified) : false
  const findings = useMemo(() => checkPrivacy(body), [body])
  const danger = findings.some((finding) => finding.level === 'danger')
  const remaining = POST_MAX_LENGTH - body.length
  const canPost = body.trim().length > 0 && remaining >= 0 && !fetching

  const submit = async () => {
    setServerError(null)
    const result = await createPost({
      input: {
        body,
        replyToId: replyTo?.id,
        kind: replyTo ? 'UPDATE' : kind,
        severity: kind === 'UPDATE' || replyTo ? undefined : severity,
      },
    })
    if (result.error) {
      setServerError(result.error.graphQLErrors[0]?.message ?? 'Could not post right now. Try again.')
      return
    }
    setBody('')
    setKind('UPDATE')
    toast(replyTo ? 'Reply posted' : kind === 'UPDATE' ? 'Your report is live' : `Your ${kind.toLowerCase()} is live`)
    onPosted?.()
  }

  // Posting is labelled "Report a crime", so say plainly where a report goes: not to SAPS. Officials publish alerts; they know.
  const emergency = !replyTo && !official && (!compact || body.length > 0)

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <Avatar initials={viewer?.initials ?? '··'} url={viewer?.avatarUrl} size={compact ? 40 : 44} />
      <View style={styles.main}>
        {official && !replyTo ? (
          <View style={styles.kinds} accessibilityRole="radiogroup" accessibilityLabel="Post type">
            {(['UPDATE', 'ADVISORY', 'ALERT'] as const).map((value) => (
              <Chip key={value} label={value === 'UPDATE' ? 'Update' : value === 'ALERT' ? 'Alert' : 'Advisory'} selected={kind === value} onPress={() => setKind(value)} />
            ))}
            {kind !== 'UPDATE'
              ? ALERT_SEVERITIES.map((value) => <Chip key={value} label={value.toLowerCase()} selected={severity === value} onPress={() => setSeverity(value)} subtle />)
              : null}
          </View>
        ) : null}

        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={replyTo ? `Reply to @${replyTo.handle}` : compact ? 'Report a crime or share a local update…' : 'What happened, and where?'}
          placeholderTextColor={c.textMuted}
          multiline
          autoFocus={autoFocus}
          accessibilityLabel={replyTo ? 'Reply text' : 'Report text'}
          maxLength={POST_MAX_LENGTH + 50}
          style={[styles.input, compact ? styles.inputCompact : styles.inputLarge, { color: c.text }]}
        />

        {emergency ? (
          <View style={[styles.findings, { backgroundColor: c.surfaceAlt }]}>
            <View style={styles.finding}>
              <Icon name="siren" size={15} color={c.danger} />
              <Txt variant="small" style={{ flex: 1, color: c.text }}>
                <Txt variant="smallStrong">Not a police report. </Txt>
                Your neighbourhood sees this, not SAPS. In an emergency, call 10111, or 112 from a mobile.
              </Txt>
            </View>
          </View>
        ) : null}

        {findings.length ? (
          <View style={[styles.findings, { backgroundColor: danger ? c.dangerTint : c.warningTint }]} accessibilityLiveRegion="polite">
            {findings.map((finding) => (
              <View key={`${finding.kind}-${finding.start}`} style={styles.finding}>
                <Icon name={finding.level === 'danger' ? 'lock' : 'shield'} size={15} color={finding.level === 'danger' ? c.danger : c.warning} />
                <Txt variant="small" style={{ flex: 1, color: c.text }}>
                  <Txt variant="smallStrong">“{body.slice(finding.start, finding.end)}”</Txt> — {finding.message}
                </Txt>
              </View>
            ))}
          </View>
        ) : !compact ? (
          <View style={[styles.findings, { backgroundColor: c.accentTint }]}>
            <View style={styles.finding}>
              <Icon name="shield" size={15} color={c.accentTintText} />
              <Txt variant="small" style={{ flex: 1, color: c.accentTintText }}>
                <Txt variant="smallStrong" style={{ color: c.accentTintText }}>
                  Protect your privacy.{' '}
                </Txt>
                Don’t share names, exact addresses, or images of victims.
              </Txt>
            </View>
          </View>
        ) : null}

        {serverError ? (
          <Txt variant="small" style={{ color: c.danger, marginTop: 8 }} accessibilityRole="alert">
            {serverError}
          </Txt>
        ) : null}

        <View style={[styles.bar, { borderTopColor: c.lineSoft }]}>
          <View style={styles.privacy}>
            <Icon name="shield" size={13} color={findings.length ? (danger ? c.danger : c.warning) : c.textMuted} />
            <Txt variant="micro" color="textMuted" style={{ letterSpacing: 0.4 }}>
              {findings.length ? `${findings.length} privacy ${findings.length === 1 ? 'issue' : 'issues'}` : 'Privacy check on'}
            </Txt>
          </View>
          <View style={styles.submit}>
            {body.length > POST_MAX_LENGTH - 80 ? (
              <Txt variant="smallStrong" style={{ color: remaining < 0 ? c.danger : c.textMuted }}>
                {remaining}
              </Txt>
            ) : null}
            <Button label={replyTo ? 'Reply' : 'Post'} size="sm" onPress={() => void submit()} disabled={!canPost} loading={fetching} />
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 12, padding: 18 },
  compact: { paddingTop: 16, paddingBottom: 10 },
  main: { flex: 1, minWidth: 0 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  input: { fontFamily: fonts.regular, paddingVertical: 7, textAlignVertical: 'top' },
  inputCompact: { fontSize: 17, lineHeight: 24, minHeight: 52 },
  inputLarge: { fontSize: 19, lineHeight: 27, minHeight: 130 },
  findings: { marginTop: 8, padding: 12, borderRadius: radius.sm, gap: 8 },
  finding: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  bar: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  submit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
