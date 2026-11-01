import { defineConfig } from 'vitest/config'

// graphql@17 ships separate development/production builds behind export
// conditions. Vite would pick the `development` build for our code while
// Node loads the production build for graphql-yoga, giving two GraphQLError
// classes and breaking `instanceof` checks. Resolve exactly like Node 24 does.
const conditions = ['module-sync', 'node', 'production']

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    // Lambda runs in UTC. The RDS Data API returns timestamps without an
    // offset and drizzle parses them as local time, so elsewhere every
    // timestamp read back (cursors, last_message_at) would be shifted.
    env: { TZ: 'UTC' },
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
