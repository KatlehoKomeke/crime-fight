import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { radius, useColors } from '@/theme'
import { Composer } from './Composer'
import { IconButton, Txt } from './ui'

interface ComposeOptions {
  replyTo?: { id: string; handle: string }
}

const ComposeContext = createContext<{ openCompose: (options?: ComposeOptions) => void }>({ openCompose: () => undefined })

export const useCompose = () => useContext(ComposeContext)

/** App-wide compose sheet: a native page sheet on iOS, a dialog on web/desktop. */
export function ComposeProvider({ children }: { children: ReactNode }) {
  const c = useColors()
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<{ open: boolean } & ComposeOptions>({ open: false })
  const close = useCallback(() => setState({ open: false }), [])
  const value = useMemo(() => ({ openCompose: (options: ComposeOptions = {}) => setState({ open: true, ...options }) }), [])
  const sheet = Platform.OS === 'ios'

  return (
    <ComposeContext.Provider value={value}>
      {children}
      <Modal
        visible={state.open}
        onRequestClose={close}
        animationType={Platform.OS === 'web' ? 'fade' : 'slide'}
        presentationStyle={sheet ? 'pageSheet' : undefined}
        transparent={!sheet}
      >
        <Pressable
          style={[styles.backdrop, !sheet && { backgroundColor: c.overlay }, sheet && { backgroundColor: c.surface }]}
          onPress={sheet ? undefined : close}
          accessibilityLabel="Close composer"
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheet ? styles.fill : styles.center}>
            <Pressable
              onPress={() => undefined}
              accessibilityViewIsModal
              aria-modal
              role="dialog"
              aria-label={state.replyTo ? 'Reply' : 'New update'}
              style={[styles.dialog, { backgroundColor: c.surface, paddingBottom: sheet ? insets.bottom : 0 }, sheet ? styles.fill : styles.floating]}
            >
              <View style={[styles.head, { borderBottomColor: c.line }]}>
                <IconButton icon="close" label="Close" onPress={close} />
                <Txt variant="label">{state.replyTo ? 'Reply' : 'New update'}</Txt>
                <View style={{ width: 36 }} />
              </View>
              {state.open ? <Composer replyTo={state.replyTo} autoFocus onPosted={close} /> : null}
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </ComposeContext.Provider>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: '9%', paddingHorizontal: 15 },
  dialog: { overflow: 'hidden' },
  floating: {
    width: '100%',
    maxWidth: 580,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
  head: { height: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
})
