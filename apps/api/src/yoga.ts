import persistedDocuments from '@civic/graphql/persisted-documents.json' with { type: 'json' }
import type { Database } from '@civic/db'
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations'
import { createYoga } from 'graphql-yoga'
import { createAuthenticator } from './auth'
import { type Context, createContextFactory } from './context'
import type { ApiEnv } from './env'
import { schema } from './schema'

const documents: Record<string, string> = persistedDocuments

export function createApi({ db, env }: { db: Database; env: ApiEnv }) {
  return createYoga<Record<string, unknown>, Context>({
    schema,
    context: createContextFactory(db, createAuthenticator(env)),
    graphqlEndpoint: '/graphql',
    healthCheckEndpoint: '/health',
    logging: env.stage === 'test' ? false : 'info',
    landingPage: false,
    graphiql: env.graphiql ? { title: `CIVIC/ONE API (${env.stage})` } : false,
    maskedErrors: { isDev: env.stage === 'local' },
    cors: {
      origin: env.corsOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['content-type', 'authorization', 'x-dev-user'],
      maxAge: 600,
    },
    plugins: [
      // Clients send a sha256 hash instead of the query text. In prod only
      // operations generated from the app's source are accepted, which removes
      // arbitrary/expensive queries as an attack surface and shrinks requests.
      usePersistedOperations({
        getPersistedOperation: (hash) => documents[hash] ?? null,
        allowArbitraryOperations: !env.persistedOnly,
        skipDocumentValidation: env.persistedOnly,
      }),
    ],
  })
}
