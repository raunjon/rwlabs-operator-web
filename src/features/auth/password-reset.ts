import { useMutation, type QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/errors'
import { NO_RESPONSE, requestForgotPassword, requestResetPassword, type PasswordReset } from './api'
import { UNREACHABLE_MESSAGE } from './session-actions'

// Shown on the forgot page whichever email was typed: deliberately the same answer for an email that has an
// account and one that doesn't, so the page can't be used to enumerate accounts.
export const FORGOT_PASSWORD_NEUTRAL_MESSAGE =
  "If an account exists for this email, we've sent a reset link. Check your inbox."

// Shown on the reset page when the link is unknown, used or expired (auth gives the same answer for all three).
export const RESET_LINK_INVALID_MESSAGE =
  "This reset link is no longer valid. Links work once and last an hour; request a new one to continue."

// Shown on the login page after a successful reset.
export const PASSWORD_UPDATED_MESSAGE = 'Password updated. Sign in with your new password.'

const UNEXPECTED_MESSAGE = 'Something went wrong. Try again.'

export type ForgotFailure = { message: string }

// What the forgot form shows for a failed request. The server never leaks whether an account exists, so a
// non-outage failure is treated as "something went wrong" rather than passed through.
export function forgotFailure(error: unknown): ForgotFailure {
  if (!(error instanceof ApiError)) return { message: UNEXPECTED_MESSAGE }
  if (isOutage(error)) return { message: UNREACHABLE_MESSAGE }
  return { message: UNEXPECTED_MESSAGE }
}

export type ResetFailure = {
  // 'invalid' is terminal for this token: the page replaces the form with a way to request a new link.
  kind: 'invalid' | 'other'
  message: string
}

// What the reset form shows for a failed reset. 404 is the link's final state; 422 keeps the server's wording so
// the user sees exactly which rule failed.
export function resetFailure(error: unknown): ResetFailure {
  if (!(error instanceof ApiError)) return { kind: 'other', message: UNEXPECTED_MESSAGE }
  if (error.status === 404) return { kind: 'invalid', message: RESET_LINK_INVALID_MESSAGE }
  if (isOutage(error)) return { kind: 'other', message: UNREACHABLE_MESSAGE }
  return { kind: 'other', message: error.message }
}

function isOutage(error: ApiError): boolean {
  return error.status === NO_RESPONSE || error.status >= 500
}

export function useForgotPassword() {
  return useMutation({ mutationFn: (email: string) => requestForgotPassword(email) })
}

export function useResetPassword() {
  return useMutation({ mutationFn: (reset: PasswordReset) => requestResetPassword(reset) })
}

// Remembers tokens the server has already rejected as invalid (used, unknown or expired), so that Back can't
// resurrect a usable form for a dead link (AGENTS.md §4). The reset endpoint has no lookup query to invalidate the
// way `useAcceptInvitation` does, so we piggyback on the QueryClient directly; the cache is per-test, which keeps
// this out of test fixtures.
const INVALID_TOKEN_KEY = ['password-reset-token-invalid'] as const

export function markResetTokenInvalid(queryClient: QueryClient, token: string): void {
  queryClient.setQueryData<true>([...INVALID_TOKEN_KEY, token], true)
}

export function isResetTokenInvalid(queryClient: QueryClient, token: string): boolean {
  return queryClient.getQueryData<boolean>([...INVALID_TOKEN_KEY, token]) === true
}
