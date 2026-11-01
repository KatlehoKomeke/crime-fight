import persistedDocuments from '@civic/graphql/persisted-documents.json' with { type: 'json' }
import type { Message, User } from '@civic/db'
import { type DocumentNode, executeSubscriptionEvent, type GraphQLSchema, parse, validateSubscriptionArgs } from 'graphql'
import type { Context } from '../context'

let inboxDocument: DocumentNode | undefined

/** The app's `Inbox` subscription, taken from the persisted-operation manifest: the API's copy of every client document. */
function inbox(): DocumentNode {
  if (inboxDocument) return inboxDocument
  const text = Object.values(persistedDocuments as Record<string, string>).find((doc) => /(^|\s)subscription Inbox[\s{]/.test(doc))
  if (!text) throw new Error('No `subscription Inbox` in the persisted documents. Run `pnpm codegen`.')
  return (inboxDocument = parse(text))
}

/** AppSync Events channel namespace for per-user inbox events (infra/lib/stacks/api-stack.ts). */
export const INBOX_NAMESPACE = 'inbox'

/**
 * Each user's private channel. Keyed by the Cognito `sub`, which the
 * namespace's subscribe handler compares with the caller's token, so nobody
 * can listen to anyone else's. Accounts without one (seeded or dev sign-in,
 * local only) use their id.
 */
export const inboxChannel = (user: Pick<User, 'id' | 'authSub'>) => `/${INBOX_NAMESPACE}/${user.authSub ?? user.id}`

/** What happened in a conversation: a new message, or (with no message) the reader caught up. */
export interface InboxEventSource {
  conversationId: string
  message: Message | null
}

/**
 * Delivers an inbox event the way a GraphQL subscription would: the app's own
 * `Inbox` subscription document is executed once per recipient, as that
 * recipient, so viewer-specific fields (unread counts, `isMine`) are right for
 * each of them and the result drops straight into the app's normalised cache
 * with no follow-up request.
 *
 * Best effort: the message is already stored, and the app refetches whenever
 * its realtime connection comes back. Like persisted operations, the Inbox
 * document may only grow, because installed apps keep reading older shapes.
 */
export async function publishInboxEvent(ctx: Context, schema: GraphQLSchema, recipients: User[], source: InboxEventSource): Promise<void> {
  await Promise.all(
    recipients.map(async (recipient) => {
      try {
        const args = validateSubscriptionArgs({ schema, document: inbox(), rootValue: source, contextValue: ctx.as(recipient) })
        if (Array.isArray(args)) throw new Error(args.map((error) => error.message).join('; '))
        const result = await executeSubscriptionEvent(args as Exclude<typeof args, readonly unknown[]>)
        if (result.errors?.length || !result.data) throw new Error(result.errors?.map((error) => error.message).join('; ') ?? 'No data')
        await ctx.realtime.publish(inboxChannel(recipient), [{ data: result.data }])
      } catch (error) {
        console.error('Inbox event not delivered', { recipient: recipient.id, conversation: source.conversationId, error })
      }
    }),
  )
}
