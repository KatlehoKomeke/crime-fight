import {
  ALERT_SEVERITIES,
  type AlertSeverity,
  canPublishAlerts,
  checkPrivacy,
  hasBlockingFinding,
  POST_MAX_LENGTH,
  type PostKind,
  type UserRole,
} from '@civic/core'
import { useMemo, useState } from 'react'
import { Platform, StyleSheet, TextInput, View } from 'react-native'
import { useMutation, useQuery } from 'urql'
import { CreatePost, ViewerQuery } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { useNear } from '@/lib/location'
import { fonts, radius, useColors } from '@/theme'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { Avatar, Button, Touchable, Txt } from './ui'

interface Props {
  replyTo?: { id: string; handle: string }
  autoFocus?: boolean
  compact?: boolean
  onPosted?: () => void
}

/**
 * Composer with an on-device privacy guard: personal data is flagged as you
 * type (no network call), and blocking findings disable publishing. The API
 * re-runs the same rules from @civic/core and is authoritative.
 */
export function Composer({ replyTo, autoFocus, compact, onPosted }: Props) {
  const c = useColors()
  const toast = useToast()
  const { status } = useAuth()
  const near = useNear()
  const [{ data: viewerData }] = useQuery({ query: ViewerQuery, pause: status !== 'signed-in' })
  const [{ fetching }, createPost] = useMutation(CreatePost)
  const [body, setBody] = useState('')
  const [attachLocation, setAttachLocation] = useState(false)
  const [kind, setKind] = useState<PostKind>('UPDATE')
  const [severity, setSeverity] = useState<AlertSeverity>('ADVISORY')
  const [serverError, setServerError] = useState<string | null>(null)

  const viewer = viewerData?.viewer
  const official = viewer ? canPublishAlerts(viewer.role as UserRole, viewer.verified) : false
  const findings = useMemo(() => checkPrivacy(body), [body])
  const blocked = hasBlockingFinding(findings)
  const remaining = POST_MAX_LENGTH - body.length
  const canPost = body.trim().length > 0 && remaining >= 0 && !blocked && !fetching

  const toggleLocation = async () => {
    if (attachLocation) return setAttachLocation(false)
    if (near.source === 'device' || (await near.locate())) setAttachLocation(true)
    else toast('Location permission is off')
  }

  const submit = async () => {
    setServerError(null)
    const result = await createPost({
      input: {
        body,
        replyToId: replyTo?.id,
        kind: replyTo ? 'UPDATE' : kind,
        severity: kind === 'UPDATE' || replyTo ? undefined : severity,
        location: attachLocation ? near.point : undefined,
      },
    })
    if (result.error) {
      setServerError(result.error.graphQLErrors[0]?.message ?? 'Could not post right now. Try again.')
      return
    }
    setBody('')
    setAttachLocation(false)
    setKind('UPDATE')
    toast(replyTo ? 'Reply posted' : 'Your update is live')
    onPosted?.()
  }

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
          placeholder={replyTo ? `Reply to @${replyTo.handle}` : compact ? 'Share a local update…' : 'What’s happening in your community?'}
          placeholderTextColor={c.textMuted}
          multiline
          autoFocus={autoFocus}
          accessibilityLabel={replyTo ? 'Reply text' : 'Update text'}
          maxLength={POST_MAX_LENGTH + 50}
          style={[styles.input, compact ? styles.inputCompact : styles.inputLarge, { color: c.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
        />

        {findings.length ? (
          <View style={[styles.findings, { backgroundColor: blocked ? c.dangerTint : c.warningTint }]} accessibilityLiveRegion="polite">
            {findings.map((finding) => (
              <View key={`${finding.kind}-${finding.start}`} style={styles.finding}>
                <Icon name={finding.level === 'block' ? 'lock' : 'shield'} size={15} color={finding.level === 'block' ? c.danger : c.warning} />
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
          <View style={styles.tools}>
            <Touchable
              onPress={() => void toggleLocation()}
              accessibilityRole="switch"
              accessibilityState={{ checked: attachLocation }}
              accessibilityLabel="Attach approximate location"
              style={[styles.tool, attachLocation && { backgroundColor: c.accentTint }]}
              hoverStyle={{ backgroundColor: c.accentTint }}
            >
              <Icon name="location" size={19} color={c.accentText} />
            </Touchable>
            <View style={styles.privacy}>
              <Icon name="shield" size={13} color={findings.length ? (blocked ? c.danger : c.warning) : c.textMuted} />
              <Txt variant="micro" color="textMuted" style={{ letterSpacing: 0.4 }}>
                {findings.length ? `${findings.length} privacy ${findings.length === 1 ? 'issue' : 'issues'}` : attachLocation ? 'Location ≈1 km' : 'Privacy check on'}
              </Txt>
            </View>
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

function Chip({ label, selected, onPress, subtle }: { label: string; selected: boolean; onPress: () => void; subtle?: boolean }) {
  const c = useColors()
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[styles.chip, { borderColor: selected ? c.text : c.line, backgroundColor: selected ? (subtle ? c.surfaceAlt : c.primary) : 'transparent' }]}
      hoverStyle={{ borderColor: c.text }}
    >
      <Txt variant="micro" style={{ color: selected && !subtle ? c.onPrimary : c.text, textTransform: subtle ? 'capitalize' : 'uppercase', letterSpacing: subtle ? 0 : 0.8 }}>
        {label}
      </Txt>
    </Touchable>
  )
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 12, padding: 18 },
  compact: { paddingTop: 16, paddingBottom: 10 },
  main: { flex: 1, minWidth: 0 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  input: { fontFamily: fonts.regular, paddingVertical: 7, textAlignVertical: 'top' },
  inputCompact: { fontSize: 17, lineHeight: 24, minHeight: 52 },
  inputLarge: { fontSize: 19, lineHeight: 27, minHeight: 130 },
  findings: { marginTop: 8, padding: 12, borderRadius: radius.sm, gap: 8 },
  finding: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  bar: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tool: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 4 },
  submit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
