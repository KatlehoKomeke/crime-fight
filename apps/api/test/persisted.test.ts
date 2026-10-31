import persistedDocuments from '@civic/graphql/persisted-documents.json' with { type: 'json' }
import { Kind, parse, visit } from 'graphql'
import { describe, expect, it } from 'vitest'

describe('persisted operations', () => {
  // Deployed clients send only a hash, so the API answers with exactly these
  // documents. Graphcache drops any object without __typename, which once left
  // every deployed feed empty while the API returned posts.
  it('select __typename on every object, which the client cache needs', () => {
    const missing: string[] = []
    for (const source of Object.values(persistedDocuments as Record<string, string>)) {
      const name = /\b(?:query|mutation|subscription) (\w+)/.exec(source)?.[1] ?? source.slice(0, 40)
      visit(parse(source), {
        SelectionSet(node, _key, parent) {
          if (!node.selections.some((selection) => selection.kind === Kind.FIELD && selection.name.value === '__typename')) {
            const at = parent && 'name' in parent && parent.name ? parent.name.value : '(root)'
            missing.push(`${name}: ${at}`)
          }
        },
      })
    }
    expect(missing).toEqual([])
  })
})
