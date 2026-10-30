import { useRouter } from 'expo-router'
import { useCallback } from 'react'
import { useToast } from '@/components/Toast'
import { useAuth } from './auth'

/** Wraps an action so signed-out users are sent to sign in instead of hitting an API error. */
export function useRequireAuth() {
  const { status } = useAuth()
  const router = useRouter()
  const toast = useToast()
  return useCallback(
    <Args extends unknown[]>(action: (...args: Args) => void, reason = 'Sign in to do that') =>
      (...args: Args) => {
        if (status === 'signed-in') return action(...args)
        toast(reason)
        router.push('/sign-in')
      },
    [router, status, toast],
  )
}
