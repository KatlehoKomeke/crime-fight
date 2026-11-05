import type { CombinedError } from 'urql'

/** The API's own sentence for what went wrong, written for the person reading it. */
export const apiMessage = (error: CombinedError | undefined, fallback: string) => error?.graphQLErrors[0]?.message ?? fallback

/**
 * Field-level messages from a refused form (`BAD_USER_INPUT` carries zod's
 * `fieldErrors` as `extensions.issues`), the first message per field.
 */
export function apiIssues(error: CombinedError | undefined): Record<string, string> {
  const raw = error?.graphQLErrors[0]?.extensions?.issues
  if (!raw || typeof raw !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [field, messages] of Object.entries(raw as Record<string, unknown>)) {
    const first = Array.isArray(messages) ? messages[0] : null
    if (typeof first === 'string') result[field] = first
  }
  return result
}
