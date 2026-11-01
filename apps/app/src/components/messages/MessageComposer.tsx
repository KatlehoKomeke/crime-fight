import { checkPrivacy, MESSAGE_MAX_LENGTH } from '@civic/core'
import { useMemo, useState } from 'react'
import { Platform, StyleSheet, TextInput, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fonts, radius, useColors } from '@/theme'
import { Icon } from '../Icon'
import { Touchable, Txt } from '../ui'

// Web scrolls the document, so the composer sticks to the viewport's bottom edge (like `sticky` headers).
const stickyBottom = (Platform.OS === 'web' ? { position: 'sticky', bottom: 0 } : {}) as ViewStyle

interface WebKeyEvent {
  nativeEvent: { key: string; shiftKey?: boolean; isComposing?: boolean }
  preventDefault: () => void
}

/**
 * Message box. Personal details are flagged as you type, worded for a private
 * message, and never blocked. On web, Enter sends and Shift+Enter adds a line.
 */
export function MessageComposer({ onSend, recipient }: { onSend: (body: string) => void; recipient: string }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const [body, setBody] = useState('')
  const [height, setHeight] = useState(40)
  const findings = useMemo(() => checkPrivacy(body, 'private'), [body])
  const danger = findings.some((finding) => finding.level === 'danger')
  const over = body.length > MESSAGE_MAX_LENGTH
  const canSend = body.trim().length > 0 && !over

  const send = () => {
    if (!canSend) return
    onSend(body.trim())
    setBody('')
    setHeight(40)
  }

  return (
    <View
      style={[
        styles.wrap,
        stickyBottom,
        { backgroundColor: c.surface, borderTopColor: c.line, paddingBottom: 10 + (Platform.OS === 'web' ? 0 : insets.bottom) },
      ]}
    >
      {findings.length ? (
        <View style={[styles.findings, { backgroundColor: danger ? c.dangerTint : c.warningTint }]} accessibilityLiveRegion="polite">
          {findings.map((finding) => (
            <View key={`${finding.kind}-${finding.start}`} style={styles.finding}>
              <Icon name="shield" size={14} color={finding.level === 'danger' ? c.danger : c.warning} />
              <Txt variant="small" style={{ flex: 1, color: c.text }}>
                {finding.message}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={`Message ${recipient}`}
          placeholderTextColor={c.textMuted}
          multiline
          maxLength={MESSAGE_MAX_LENGTH + 50}
          accessibilityLabel={`Message ${recipient}`}
          onContentSizeChange={(event) => setHeight(Math.min(140, Math.max(40, event.nativeEvent.contentSize.height)))}
          onKeyPress={
            Platform.OS === 'web'
              ? (event) => {
                  const { nativeEvent, preventDefault } = event as unknown as WebKeyEvent
                  if (nativeEvent.key !== 'Enter' || nativeEvent.shiftKey || nativeEvent.isComposing) return
                  preventDefault.call(event)
                  send()
                }
              : undefined
          }
          style={[styles.input, { height, color: c.text, backgroundColor: c.surfaceAlt }]}
        />
        <Touchable
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          style={[styles.send, { backgroundColor: c.primary }, !canSend && { opacity: 0.35 }]}
        >
          <Icon name="send" size={18} color={c.onPrimary} />
        </Touchable>
      </View>
      {over ? (
        <Txt variant="small" style={{ color: c.danger }}>
          Keep it under {MESSAGE_MAX_LENGTH} characters ({body.length - MESSAGE_MAX_LENGTH} over)
        </Txt>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, zIndex: 10 },
  findings: { padding: 10, borderRadius: radius.sm, gap: 6 },
  finding: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, fontFamily: fonts.regular, fontSize: 15, lineHeight: 20 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
})
