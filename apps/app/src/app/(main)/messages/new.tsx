import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native'
import { useMutation, useQuery } from 'urql'
import { Icon } from '@/components/Icon'
import { PageHeader, Screen } from '@/components/Screen'
import { useToast } from '@/components/Toast'
import { Avatar, Button, EmptyState, PostSkeleton, Touchable, Txt, VerifiedBadge } from '@/components/ui'
import { MessageContactsQuery, StartConversation } from '@/graphql/documents'
import { useAuth } from '@/lib/auth'
import { pageMetadata } from '@/lib/seo'
import { fonts, radius, useColors } from '@/theme'

export function generateMetadata() {
  return pageMetadata({ title: 'New message', path: '/messages/new', noindex: true })
}

export default function NewMessageScreen() {
  const c = useColors()
  const router = useRouter()
  const toast = useToast()
  const { status } = useAuth()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const [{ data, fetching, error }] = useQuery({ query: MessageContactsQuery, variables: { query: query || null }, pause: status !== 'signed-in' })
  const [{ fetching: opening, operation }, start] = useMutation(StartConversation)
  const contacts = data?.messageContacts ?? []

  const open = async (userId: string) => {
    const result = await start({ userId })
    const id = result.data?.startConversation.id
    if (id) router.replace(`/messages/${id}`)
    else toast(result.error?.graphQLErrors[0]?.message ?? 'Couldn’t open the conversation')
  }

  return (
    <Screen title="New message" header={<PageHeader title="New message" subtitle="People you follow who follow you back" back />}>
      {status === 'signed-out' ? (
        <EmptyState icon="lock" title="Sign in to send messages" body="Messages are open between people who follow each other." action={<Button label="Sign in" onPress={() => router.push('/sign-in')} />} />
      ) : (
        <View>
          <View style={[styles.search, { backgroundColor: c.surfaceAlt }]}>
            <Icon name="search" size={18} color={c.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search your contacts"
              placeholderTextColor={c.textMuted}
              accessibilityLabel="Search your contacts"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: c.text }]}
            />
            {fetching && data ? <ActivityIndicator size="small" color={c.textMuted} /> : null}
          </View>

          {!data && (fetching || status === 'loading') ? (
            [0, 1, 2].map((i) => <PostSkeleton key={i} />)
          ) : error ? (
            <EmptyState icon="globe" title="Can’t reach CIVIC/ONE" body="Check your connection and try again." />
          ) : contacts.length === 0 ? (
            <EmptyState
              icon="mail"
              title={query ? 'No one by that name' : 'No one to message yet'}
              body={
                query
                  ? 'You can only message people you follow who follow you back.'
                  : 'Messages are open between people who follow each other. Once someone you follow follows you back, they’ll appear here.'
              }
            />
          ) : (
            contacts.map((user) => {
              const busy = opening && operation?.variables.userId === user.id
              return (
                <Touchable
                  key={user.id}
                  onPress={() => void open(user.id)}
                  disabled={opening}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${user.displayName}`}
                  style={[styles.row, { borderBottomColor: c.line }]}
                  hoverStyle={{ backgroundColor: c.surfaceAlt }}
                >
                  <Avatar initials={user.initials} url={user.avatarUrl} size={44} official={user.verified && user.role !== 'MEMBER'} />
                  <View style={styles.names}>
                    <View style={styles.nameLine}>
                      <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {user.displayName}
                      </Txt>
                      {user.verified ? <VerifiedBadge size={14} /> : null}
                    </View>
                    <Txt variant="small" color="textMuted" numberOfLines={1}>
                      @{user.handle}
                    </Txt>
                  </View>
                  {busy ? <ActivityIndicator size="small" color={c.textMuted} /> : <Icon name="mail" size={20} color={c.textMuted} />}
                </Touchable>
              )
            })
          )}
        </View>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, paddingHorizontal: 14, borderRadius: radius.pill },
  input: { flex: 1, paddingVertical: 11, fontFamily: fonts.regular, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1 },
  names: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
