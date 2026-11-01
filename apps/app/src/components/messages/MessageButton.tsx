import { useRouter } from 'expo-router'
import { useMutation } from 'urql'
import { StartConversation } from '@/graphql/documents'
import { useToast } from '../Toast'
import { Button } from '../ui'

/** Opens (or starts) your conversation with someone you follow who follows you back. */
export function MessageButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter()
  const toast = useToast()
  const [{ fetching }, start] = useMutation(StartConversation)

  const open = async () => {
    const result = await start({ userId })
    const id = result.data?.startConversation.id
    if (id) router.push(`/messages/${id}`)
    else toast(result.error?.graphQLErrors[0]?.message ?? 'Couldn’t open the conversation')
  }

  return <Button label="Message" tone="outline" size="md" icon="mail" loading={fetching} accessibilityLabel={`Message ${name}`} onPress={() => void open()} />
}
