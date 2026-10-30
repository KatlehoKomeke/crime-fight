import SchemaBuilder from '@pothos/core'
import RelayPlugin from '@pothos/plugin-relay'
import type { Context } from '../context'

export const builder = new SchemaBuilder<{
  Context: Context
  DefaultFieldNullability: false
  DefaultEdgesNullability: false
  DefaultNodeNullability: false
  Scalars: {
    DateTime: { Input: Date; Output: Date | string }
  }
}>({
  plugins: [RelayPlugin],
  // Non-null by default: the generated client types carry no needless `| null`.
  defaultFieldNullability: false,
  relay: {
    clientMutationId: 'omit',
    cursorType: 'String',
    nodeQueryOptions: false,
    nodesQueryOptions: false,
    edgesFieldOptions: { nullable: false },
    nodeFieldOptions: { nullable: false },
  },
})

builder.scalarType('DateTime', {
  description: 'ISO-8601 timestamp in UTC.',
  serialize: (value) => (value instanceof Date ? value : new Date(value)).toISOString(),
  parseValue: (value) => {
    const date = new Date(String(value))
    if (Number.isNaN(date.getTime())) throw new TypeError('Invalid DateTime')
    return date
  },
})
