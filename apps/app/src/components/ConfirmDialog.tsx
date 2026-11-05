import type { ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { radius, useColors } from '@/theme'
import { Button, Txt } from './ui'

/**
 * "Are you sure?" for actions that move money or can't be undone. The title
 * asks the question, the body names the consequence, and the confirm button
 * says what it does ("Cancel and refund", not "OK"). `children` can hold a
 * required note or declaration; `disabled` keeps confirm off until it's given.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  confirmTone = 'primary',
  cancelLabel = 'Not yet',
  loading,
  disabled,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  confirmTone?: 'primary' | 'danger' | 'accent'
  cancelLabel?: string
  loading?: boolean
  disabled?: boolean
  onConfirm: () => void
  onClose: () => void
  children?: ReactNode
}) {
  const c = useColors()
  const close = () => {
    if (!loading) onClose()
  }
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={[styles.backdrop, { backgroundColor: c.overlay }]} onPress={close} accessibilityLabel="Close dialog">
        <Pressable onPress={() => undefined} role="dialog" aria-modal aria-label={title} accessibilityViewIsModal style={[styles.panel, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Txt variant="title" accessibilityRole="header">
            {title}
          </Txt>
          {body ? (
            <Txt variant="small" color="textMuted">
              {body}
            </Txt>
          ) : null}
          {children}
          <View style={styles.actions}>
            <Button label={cancelLabel} tone="ghost" disabled={loading} onPress={onClose} />
            <Button label={confirmLabel} tone={confirmTone} loading={loading} disabled={disabled} onPress={onConfirm} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 400, gap: 12, padding: 20, borderRadius: radius.lg, borderWidth: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 6 },
})
