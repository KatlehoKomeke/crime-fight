import { useMutation } from 'urql'
import { FollowUser, UnfollowUser } from '@/graphql/documents'
import { useRequireAuth } from '@/lib/use-require-auth'
import { Button } from './ui'

export function FollowButton({ userId, following, name, size = 'sm' }: { userId: string; following: boolean; name: string; size?: 'sm' | 'md' }) {
  const gate = useRequireAuth()
  const [, follow] = useMutation(FollowUser)
  const [, unfollow] = useMutation(UnfollowUser)
  return (
    <Button
      size={size}
      tone={following ? 'outline' : 'primary'}
      label={following ? 'Following' : 'Follow'}
      accessibilityLabel={following ? `Unfollow ${name}` : `Follow ${name}`}
      onPress={gate(() => void (following ? unfollow({ id: userId }) : follow({ id: userId })), 'Sign in to follow trusted sources')}
    />
  )
}
