import { GraphQLError } from 'graphql'

export type ErrorCode = 'BAD_USER_INPUT' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'

/** Errors created here are client-safe; anything else is masked by Yoga in deployed stages. */
export function apiError(code: ErrorCode, message: string, extensions: Record<string, unknown> = {}): GraphQLError {
  return new GraphQLError(message, { extensions: { code, ...extensions } })
}
