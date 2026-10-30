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
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
