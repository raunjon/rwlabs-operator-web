import { useMutation } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/errors'
import { endSession, sessionToken, startSession, type PanelSession } from '@/lib/session/session'
import { NO_RESPONSE, requestSignIn, requestSignOut } from './api'

export const NOT_ALLOWED_MESSAGE = "This account can't use the operator panel yet."
export const WRONG_CREDENTIALS_MESSAGE = "That email and password don't match an account."
export const UNREACHABLE_MESSAGE = "Can't reach the server right now. Check your connection and try again."

// What the login form shows for a failed sign-in. The server's own wording is kept for the cases it explains
// well (a suspended organisation, a missing field); wrong credentials and outages get plainer copy.
export function signInErrorMessage(error: unknown): string {
  if (error instanceof NotAllowedError) return NOT_ALLOWED_MESSAGE
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.'
  if (error.status === 401) return WRONG_CREDENTIALS_MESSAGE
  if (error.status === NO_RESPONSE || error.status >= 500) return UNREACHABLE_MESSAGE
  return error.message
}

export class NotAllowedError extends Error {
  constructor() {
    super(NOT_ALLOWED_MESSAGE)
    this.name = 'NotAllowedError'
  }
}

// Signs in and keeps the session. A role that can't use the panel is signed straight back out on the server and
// nothing is stored (the role gate, spec §5.2).
export async function signIn(email: string, password: string): Promise<PanelSession> {
  const token = await requestSignIn(email, password)
  const result = startSession(token)
  if (result.ok) return result.session
  if (result.reason === 'not-allowed') {
    await requestSignOut(token)
    throw new NotAllowedError()
  }
  throw new ApiError(200, 'The server sent an unexpected response')
}

// Clears the session first, synchronously, then asks the server to revoke the token. Waiting for the server
// first would leave the token in sessionStorage while the request is in flight, and a reload in that window would
// restore the session. The authenticated layout notices the session ending and returns to the login page.
export async function signOut() {
  const token = sessionToken()
  endSession('signed-out')
  if (token) await requestSignOut(token)
}

export function useSignIn() {
  return useMutation({ mutationFn: ({ email, password }: { email: string; password: string }) => signIn(email, password) })
}
