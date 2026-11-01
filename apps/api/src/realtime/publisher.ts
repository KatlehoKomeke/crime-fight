import { lambdaSigner } from '../aws'

/** Sends events to everyone subscribed to a channel. */
export interface Publisher {
  publish(channel: string, events: unknown[]): Promise<void>
}

/**
 * Publishes to AWS AppSync Events over HTTPS, signed with the function's own
 * IAM role (only the API may publish; clients can only subscribe).
 * https://docs.aws.amazon.com/appsync/latest/eventapi/publish-http.html
 */
export function appSyncPublisher({ host, region }: { host: string; region: string }): Publisher {
  const signer = lambdaSigner('appsync', region)

  return {
    async publish(channel, events) {
      // AppSync takes at most five events per request, each as a JSON string.
      for (let i = 0; i < events.length; i += 5) {
        const body = JSON.stringify({ channel, events: events.slice(i, i + 5).map((event) => JSON.stringify(event)) })
        const signed = await signer.sign({
          method: 'POST',
          protocol: 'https:',
          hostname: host,
          path: '/event',
          headers: { host, 'content-type': 'application/json' },
          body,
        })
        const response = await fetch(`https://${host}/event`, { method: 'POST', headers: signed.headers, body })
        if (!response.ok) throw new Error(`AppSync publish to ${channel} failed: ${response.status} ${await response.text()}`)
      }
    },
  }
}

/**
 * In-process pub/sub for local development and tests. The dev server exposes
 * it over the same WebSocket protocol as AppSync Events (realtime/local-server.ts).
 */
export function memoryHub() {
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  return {
    publish(channel: string, events: unknown[]) {
      for (const event of events) for (const listener of listeners.get(channel) ?? []) listener(event)
      return Promise.resolve()
    },
    subscribe(channel: string, listener: (event: unknown) => void): () => void {
      const set = listeners.get(channel) ?? new Set()
      set.add(listener)
      listeners.set(channel, set)
      return () => {
        set.delete(listener)
        if (!set.size) listeners.delete(channel)
      }
    },
  }
}

export type MemoryHub = ReturnType<typeof memoryHub>
