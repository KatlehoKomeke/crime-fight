import type { CodegenConfig } from '@graphql-codegen/cli'

/**
 * Operations live next to the components that use them in apps/app. Codegen
 * scans them, emits fully typed documents, and writes a hash → document
 * manifest that the API uses as its persisted-operation allow-list.
 */
const config: CodegenConfig = {
  schema: './schema.graphql',
  documents: ['../../apps/app/src/**/*.{ts,tsx}', '!../../apps/app/src/**/*.test.{ts,tsx}'],
  ignoreNoDocuments: true,
  generates: {
    './src/gql/': {
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
        persistedDocuments: { mode: 'embedHashInDocument', hashAlgorithm: 'sha256' },
      },
      config: {
        scalars: { DateTime: 'string', ID: 'string' },
        enumsAsTypes: true,
        useTypeImports: true,
        skipTypename: false,
        avoidOptionals: { field: true, inputValue: false, object: true, defaultValue: true },
      },
    },
  },
}

export default config
