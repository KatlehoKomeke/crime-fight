import type { Server } from 'node:http'
import type { Database } from '@civic/db'
import { WebSocketServer } from 'ws'
import type { Authenticator } from '../auth'
import { resolveViewer } from '../data/users'
import { inboxChannel } from './inbox'
import type { MemoryHub } from './publisher'

const PROTOCOL = 'aws-appsync-event-ws'
const KEEP_ALIVE_MS = 60_000

interface ClientMessage {
  type?: string
  id?: string
  channel?: string
  authorization?: Record<string, unknown>
}

/**
 * Local stand-in for AWS AppSync Events: the same WebSocket protocol on the
 * same path, so the app's realtime client runs unchanged in development. It
 * covers what the app uses (subscribe, unsubscribe, keep-alives) and the
 * deployed rule that you can only subscribe to your own inbox channel.
 * https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-websocket-protocol.html
 */
export function attachLocalRealtime(server: Server, { hub, db, authenticate }: { hub: MemoryHub; db: Database; authenticate: Authenticator }) {
  const wss = new WebSocketServer({ server, path: '/event/realtime', handleProtocols: (protocols) => (protocols.has(PROTOCOL) ? PROTOCOL : false) })

  /** The one channel these credentials may subscribe to, or null. */
  async function channelFor(authorization: Record<string, unknown> = {}): Promise<string | null> {
    const headers = Object.entries(authorization).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    const identity = await authenticate(new Request('http://localhost/event', { headers }))
    if (!identity || identity === 'invalid') return null
    const user = await resolveViewer(db, identity)
    return user ? inboxChannel(user) : null
  }

  wss.on('connection', (socket) => {
    const subscriptions = new Map<string, () => void>()
    const send = (message: object) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(message))
    const keepAlive = setInterval(() => send({ type: 'ka' }), KEEP_ALIVE_MS)
    socket.on('close', () => {
      clearInterval(keepAlive)
      for (const stop of subscriptions.values()) stop()
    })

    socket.on('message', (raw) => {
      let message: ClientMessage
      try {
        message = JSON.parse(String(raw)) as ClientMessage
      } catch {
        return
      }
      const id = message.id ?? ''
      if (message.type === 'connection_init') {
        send({ type: 'connection_ack', connectionTimeoutMs: 5 * KEEP_ALIVE_MS })
      } else if (message.type === 'subscribe') {
        void channelFor(message.authorization).then((allowed) => {
          if (!allowed || allowed !== message.channel || subscriptions.has(id)) {
            send({ type: 'subscribe_error', id, errors: [{ errorType: 'UnauthorizedException', message: 'You can only subscribe to your own inbox' }] })
            return
          }
          subscriptions.set(id, hub.subscribe(allowed, (event) => send({ type: 'data', id, event: JSON.stringify(event) })))
          send({ type: 'subscribe_success', id })
        })
      } else if (message.type === 'unsubscribe') {
        subscriptions.get(id)?.()
        subscriptions.delete(id)
        send({ type: 'unsubscribe_success', id })
      }
    })
  })
  return wss
}
