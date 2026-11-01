import { AppState, Platform } from 'react-native'
import type { AuthBridge } from './graphql/client'

/**
 * Client for AWS AppSync Events, the WebSocket service that delivers inbox
 * events (the dev API speaks the same protocol locally). Hand-rolled rather
 * than Amplify: the protocol is a few message types, and the web bundle is
 * kept small.
 * https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-websocket-protocol.html
 */
export interface RealtimeClient {
  /** Listens to a channel until the returned function is called. */
  subscribe: (channel: string, onEvent: (event: unknown) => void) => () => void
  /** Runs after a dropped connection comes back: events sent meanwhile were missed, so refetch. */
  onReconnect: (listener: () => void) => () => void
  close: () => void
}

const PROTOCOL = 'aws-appsync-event-ws'
const MAX_BACKOFF_MS = 30_000

const base64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

interface ServerMessage {
  type: string
  id?: string
  connectionTimeoutMs?: number
  event?: unknown
  errors?: unknown
}

export function createRealtimeClient({ url, host, auth }: { url: string; host: string; auth: AuthBridge }): RealtimeClient {
  const subscriptions = new Map<string, { channel: string; onEvent: (event: unknown) => void }>()
  const reconnectListeners = new Set<() => void>()
  let socket: WebSocket | null = null
  let acknowledged = false
  let connectedBefore = false
  let closed = false
  let attempts = 0
  let nextId = 0
  let timeoutMs = 300_000
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined

  // AppSync reads `Authorization` (a Cognito ID token); the dev API reads `x-dev-user`.
  const authorization = (): Record<string, string> => {
    const headers = auth.headers()
    return headers.authorization ? { host, Authorization: headers.authorization } : { host, ...headers }
  }
  const signedIn = (headers: Record<string, string>) => Object.keys(headers).length > 1

  const send = (message: object) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }
  const subscribeTo = (id: string, channel: string) => send({ type: 'subscribe', id, channel, authorization: authorization() })

  // AppSync sends a keep-alive every minute; silence past the timeout means the connection is dead.
  const keepAlive = () => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => socket?.close(), timeoutMs)
  }

  const disconnect = () => {
    clearTimeout(retryTimer)
    clearTimeout(watchdog)
    const current = socket
    socket = null
    acknowledged = false
    current?.close()
  }

  const scheduleReconnect = () => {
    if (closed || !subscriptions.size) return
    clearTimeout(retryTimer)
    // Jittered exponential backoff, as AWS recommends.
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts++) * (0.5 + Math.random() / 2)
    retryTimer = setTimeout(() => void connect(), delay)
  }

  const handle = (message: ServerMessage) => {
    switch (message.type) {
      case 'connection_ack':
        acknowledged = true
        attempts = 0
        timeoutMs = message.connectionTimeoutMs ?? timeoutMs
        keepAlive()
        for (const [id, { channel }] of subscriptions) subscribeTo(id, channel)
        if (connectedBefore) for (const listener of reconnectListeners) listener()
        connectedBefore = true
        break
      case 'ka':
        keepAlive()
        break
      case 'data': {
        const subscription = message.id ? subscriptions.get(message.id) : undefined
        // One JSON string per event; tolerate an array of them as well.
        for (const raw of [message.event].flat()) subscription?.onEvent(typeof raw === 'string' ? JSON.parse(raw) : raw)
        break
      }
      case 'subscribe_error':
      case 'error':
        console.warn('Realtime:', message.type, message.errors)
        // Usually a token that expired while connected: reconnect with a fresh one.
        if (auth.isExpiringSoon()) socket?.close()
        break
    }
  }

  async function connect() {
    if (closed || socket || !subscriptions.size) return
    if (auth.isExpiringSoon()) await auth.refresh().catch(() => undefined)
    const headers = authorization()
    if (closed || socket || !signedIn(headers)) return
    const ws = new WebSocket(url, [PROTOCOL, `header-${base64Url(JSON.stringify(headers))}`])
    socket = ws
    ws.addEventListener('open', () => send({ type: 'connection_init' }))
    ws.addEventListener('message', (event) => {
      try {
        handle(JSON.parse(String(event.data)) as ServerMessage)
      } catch (error) {
        console.warn('Realtime: unreadable message', error)
      }
    })
    ws.addEventListener('close', () => {
      if (socket !== ws) return
      socket = null
      acknowledged = false
      clearTimeout(watchdog)
      scheduleReconnect()
    })
    ws.addEventListener('error', () => ws.close())
  }

  // Phones drop sockets in the background and laptops sleep: reconnect as soon as we're back.
  const resume = () => {
    if (socket || closed || !subscriptions.size) return
    attempts = 0
    void connect()
  }
  const appState = Platform.OS === 'web' ? null : AppState.addEventListener('change', (state) => state === 'active' && resume())
  const onVisible = () => document.visibilityState === 'visible' && resume()
  if (Platform.OS === 'web') {
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', onVisible)
  }

  return {
    subscribe(channel, onEvent) {
      const id = `s${++nextId}`
      subscriptions.set(id, { channel, onEvent })
      if (acknowledged) subscribeTo(id, channel)
      else void connect()
      return () => {
        if (!subscriptions.delete(id)) return
        if (acknowledged) send({ type: 'unsubscribe', id })
        if (!subscriptions.size) {
          connectedBefore = false
          disconnect()
        }
      }
    },
    onReconnect(listener) {
      reconnectListeners.add(listener)
      return () => void reconnectListeners.delete(listener)
    },
    close() {
      closed = true
      subscriptions.clear()
      reconnectListeners.clear()
      disconnect()
      appState?.remove()
      if (Platform.OS === 'web') {
        window.removeEventListener('online', resume)
        document.removeEventListener('visibilitychange', onVisible)
      }
    },
  }
}
