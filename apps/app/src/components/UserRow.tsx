import type { UserRowFieldsFragment } from '@civic/graphql'
import { Link } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { FollowButton } from './FollowButton'
import { Avatar, Txt, VerifiedBadge } from './ui'

export function UserRow({ user, dense }: { user: UserRowFieldsFragment; dense?: boolean }) {
  return (
    <View style={[styles.row, dense ? styles.dense : { paddingHorizontal: 18 }]}>
      <Link href={`/u/${user.handle}`} asChild>
        <Pressable style={styles.identity} accessibilityLabel={`${user.displayName} profile`}>
          <Avatar initials={user.initials} url={user.avatarUrl} size={dense ? 36 : 44} official={user.verified && user.role !== 'MEMBER'} />
          <View style={styles.names}>
            <View style={styles.nameLine}>
              <Txt variant="smallStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                {user.displayName}
              </Txt>
              {user.verified ? <VerifiedBadge size={13} /> : null}
            </View>
            <Txt variant="small" color="textMuted" numberOfLines={1}>
              @{user.handle}
            </Txt>
          </View>
        </Pressable>
      </Link>
      {user.isViewer ? null : <FollowButton userId={user.id} following={user.viewerIsFollowing} name={user.displayName} />}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  dense: { paddingVertical: 7 },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  names: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
