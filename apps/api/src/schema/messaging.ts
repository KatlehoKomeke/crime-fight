import { canMessage } from '@civic/core'
import type { Conversation, Message, User } from '@civic/db'
import type { Context } from '../context'
import {
  markConversationRead,
  messageContacts,
  pageConversations,
  pageMessages,
  sendMessage,
  startConversation,
  unreadConversationCount,
  UUID,
} from '../data/messaging'
import { encodeCursor } from '../data/pagination'
import { apiError } from '../errors'
import { type InboxEventSource, inboxChannel, publishInboxEvent } from '../realtime/inbox'
import { builder } from './builder'
import { UserRef } from './types'

export const ConversationRef = builder.objectRef<Conversation>('Conversation')
export const MessageRef = builder.objectRef<Message>('Message')
export const InboxEventRef = builder.objectRef<InboxEventSource>('InboxEvent')

const MessageEdge = builder.edgeObject({ type: MessageRef, name: 'MessageEdge' })
const MessageConnection = builder.connectionObject({ type: MessageRef, name: 'MessageConnection' }, MessageEdge)
const ConversationConnection = builder.connectionObject({ type: ConversationRef, name: 'ConversationConnection' }, { name: 'ConversationEdge' })

const isUser = (user: User | Error | null): user is User => user !== null && !(user instanceof Error)

/** Everyone in the conversation except the viewer. */
async function othersIn(conversationId: string, ctx: Context) {
  const viewer = (await ctx.viewer())?.id
  return (await ctx.loaders.memberIds.load(conversationId)).filter((id) => id !== viewer)
}

async function mutualWith(userId: string, ctx: Context): Promise<boolean> {
  const [following, followsViewer] = await Promise.all([ctx.loaders.following.load(userId), ctx.loaders.followsViewer.load(userId)])
  return canMessage(following, followsViewer)
}

MessageRef.implement({
  description: 'A direct message.',
  fields: (t) => ({
    id: t.exposeID('id'),
    body: t.exposeString('body'),
    createdAt: t.field({ type: 'DateTime', resolve: (message) => message.createdAt }),
    sender: t.field({
      type: UserRef,
      resolve: async (message, _, ctx) => {
        const sender = await ctx.loaders.user.load(message.senderId)
        if (!sender) throw new Error(`Sender ${message.senderId} missing`)
        return sender
      },
    }),
    isMine: t.boolean({ resolve: async (message, _, ctx) => (await ctx.viewer())?.id === message.senderId }),
  }),
})

ConversationRef.implement({
  description: 'A private conversation. For now always between two people who follow each other.',
  fields: (t) => ({
    id: t.exposeID('id'),
    members: t.field({
      type: [UserRef],
      description: 'Everyone in the conversation except you.',
      resolve: async (conversation, _, ctx) => (await ctx.loaders.user.loadMany(await othersIn(conversation.id, ctx))).filter(isUser),
    }),
    lastMessage: t.field({ type: MessageRef, nullable: true, resolve: (conversation, _, ctx) => ctx.loaders.lastMessage.load(conversation.id) }),
    lastMessageAt: t.field({ type: 'DateTime', nullable: true, resolve: (conversation) => conversation.lastMessageAt }),
    unreadCount: t.int({ resolve: (conversation, _, ctx) => ctx.loaders.unreadCount.load(conversation.id) }),
    viewerCanSend: t.boolean({
      description: 'False once you and the other person no longer follow each other; the history stays readable.',
      resolve: async (conversation, _, ctx) => {
        const others = await othersIn(conversation.id, ctx)
        return others.length > 0 && (await Promise.all(others.map((id) => mutualWith(id, ctx)))).every(Boolean)
      },
    }),
    messages: t.connection(
      { type: MessageRef, description: 'Newest first.', resolve: (conversation, args, ctx) => pageMessages(ctx.db, conversation.id, args) },
      MessageConnection,
    ),
  }),
})

InboxEventRef.implement({
  description:
    'Something changed in one of your conversations: a new message arrived, or you read it. Returned by the messaging mutations and delivered over your realtime channel as the `inbox` subscription.',
  fields: (t) => ({
    conversation: t.field({
      type: ConversationRef,
      resolve: async (event, _, ctx) => {
        if (event.message) ctx.loaders.lastMessage.prime(event.conversationId, event.message)
        const conversation = await ctx.loaders.conversation.load(event.conversationId)
        if (!conversation) throw new Error(`Conversation ${event.conversationId} missing`)
        return conversation
      },
    }),
    messageEdge: t.field({
      type: MessageEdge,
      nullable: true,
      description: 'The new message as an edge of `Conversation.messages`, ready to add to a cached page. Null for read events.',
      resolve: (event) => (event.message ? { cursor: encodeCursor(event.message), node: event.message } : null),
    }),
    viewer: t.field({ type: UserRef, description: 'You, so counts like `unreadConversationCount` stay current.', resolve: (_, __, ctx) => ctx.requireViewer() }),
  }),
})

builder.objectFields(UserRef, (t) => ({
  viewerCanMessage: t.boolean({
    description: 'You follow each other, so you can exchange direct messages.',
    resolve: async (user, _, ctx) => {
      const viewer = await ctx.viewer()
      return Boolean(viewer && viewer.id !== user.id && (await mutualWith(user.id, ctx)))
    },
  }),
  inboxChannel: t.string({
    nullable: true,
    description: 'Your realtime channel for the `inbox` subscription. Only visible to the account owner.',
    resolve: async (user, _, ctx) => ((await ctx.viewer())?.id === user.id ? inboxChannel(user) : null),
  }),
  unreadConversationCount: t.int({
    nullable: true,
    description: 'Conversations with messages you haven’t read. Only visible to the account owner.',
    resolve: async (user, _, ctx) => ((await ctx.viewer())?.id === user.id ? unreadConversationCount(ctx.db, user.id) : null),
  }),
}))

builder.queryFields((t) => ({
  conversations: t.connection(
    {
      type: ConversationRef,
      description: 'Your conversations, most recent activity first.',
      resolve: async (_root, args, ctx) => pageConversations(ctx.db, (await ctx.requireViewer()).id, args),
    },
    ConversationConnection,
  ),
  conversation: t.field({
    type: ConversationRef,
    nullable: true,
    description: 'One of your conversations; null if it doesn’t exist or you’re not in it.',
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, { id }, ctx) => {
      await ctx.requireViewer()
      if (!UUID.test(String(id))) return null
      return (await ctx.loaders.membership.load(String(id))) ? ctx.loaders.conversation.load(String(id)) : null
    },
  }),
  messageContacts: t.field({
    type: [UserRef],
    description: 'People you can message: everyone you follow who follows you back.',
    args: { query: t.arg.string(), first: t.arg.int() },
    resolve: async (_root, args, ctx) =>
      messageContacts(ctx.db, (await ctx.requireViewer()).id, args.query ?? '', Math.min(Math.max(args.first ?? 20, 1), 50)),
  }),
}))

builder.mutationFields((t) => ({
  startConversation: t.field({
    type: ConversationRef,
    description: 'Opens your conversation with someone you follow who follows you back, creating it the first time.',
    args: { userId: t.arg.id({ required: true }) },
    resolve: async (_root, { userId }, ctx) => startConversation(ctx.db, await ctx.requireViewer(), String(userId)),
  }),

  sendMessage: t.field({
    type: InboxEventRef,
    args: { conversationId: t.arg.id({ required: true }), body: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx, info) => {
      const { message, memberIds } = await sendMessage(ctx.db, await ctx.requireViewer(), String(args.conversationId), args.body)
      const event: InboxEventSource = { conversationId: message.conversationId, message }
      // Everyone in the conversation, the sender too, so their other devices update.
      await publishInboxEvent(ctx, info.schema, (await ctx.loaders.user.loadMany(memberIds)).filter(isUser), event)
      return event
    },
  }),

  markConversationRead: t.field({
    type: InboxEventRef,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, { id }, ctx, info) => {
      const viewer = await ctx.requireViewer()
      await markConversationRead(ctx.db, viewer, String(id))
      const event: InboxEventSource = { conversationId: String(id), message: null }
      // Only to yourself: your other devices clear the badge too.
      await publishInboxEvent(ctx, info.schema, [viewer], event)
      return event
    },
  }),
}))

builder.subscriptionType({
  fields: (t) => ({
    inbox: t.field({
      type: InboxEventRef,
      description:
        'Your inbox events. Not served over /graphql: subscribe to `viewer.inboxChannel` on the realtime endpoint, where each event arrives as this subscription’s result.',
      subscribe: (): AsyncIterable<InboxEventSource> => {
        throw apiError('BAD_USER_INPUT', 'Subscribe to viewer.inboxChannel on the realtime endpoint instead')
      },
      resolve: (event) => event,
    }),
  }),
})
