import { useMutation } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/errors'
import { endSession, sessionToken, startSession, type PanelSession } from '@/lib/session/session'
import { NO_RESPONSE, requestSignIn, requestSignOut, requestSignUp, type SignupAccount } from './api'

export const NOT_ALLOWED_MESSAGE = "This account can't use the operator panel yet."
export const WRONG_CREDENTIALS_MESSAGE = "That email and password don't match an account."
export const UNREACHABLE_MESSAGE = "Can't reach the server right now. Check your connection and try again."
export const CREATED_NOT_SIGNED_IN_MESSAGE =
  'Your account was created, but signing you in failed. Sign in with your new email and password.'
const UNEXPECTED_MESSAGE = 'Something went wrong. Try again.'

// What the login form shows for a failed sign-in. The server's own wording is kept for the cases it explains
// well (a suspended organisation, a missing field); wrong credentials and outages get plainer copy.
export function signInErrorMessage(error: unknown): string {
  if (error instanceof NotAllowedError) return NOT_ALLOWED_MESSAGE
  if (!(error instanceof ApiError)) return UNEXPECTED_MESSAGE
  if (error.status === 401) return WRONG_CREDENTIALS_MESSAGE
  if (isOutage(error)) return UNREACHABLE_MESSAGE
  return error.message
}

function isOutage(error: ApiError): boolean {
  return error.status === NO_RESPONSE || error.status >= 500
}

export class NotAllowedError extends Error {
  constructor() {
    super(NOT_ALLOWED_MESSAGE)
    this.name = 'NotAllowedError'
  }
}

// The signup went through but the sign-in that follows it didn't: the account exists, so retrying the signup
// would only report the email as taken.
export class SignedUpNotSignedInError extends Error {
  constructor() {
    super(CREATED_NOT_SIGNED_IN_MESSAGE)
    this.name = 'SignedUpNotSignedInError'
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

// Creates the organisation and its admin, then signs that admin in so they land in the panel without a second
// step. Signup itself returns no gateway JWT (see requestSignUp), hence the sign-in.
export async function signUp(account: SignupAccount): Promise<PanelSession> {
  await requestSignUp(account)
  try {
    return await signIn(account.email, account.password)
  } catch {
    throw new SignedUpNotSignedInError()
  }
}

export type SignUpFailure = {
  // email-taken and name-in-use are the two 409s auth sends; the page offers a way out for each.
  kind: 'email-taken' | 'name-in-use' | 'created-not-signed-in' | 'other'
  message: string
}

// What the signup form shows for a failed signup. Validation errors arrive as one joined message, so they are
// shown at form level; the browser's own checks cover the per-field cases first.
export function signUpFailure(error: unknown): SignUpFailure {
  if (error instanceof SignedUpNotSignedInError) {
    return { kind: 'created-not-signed-in', message: CREATED_NOT_SIGNED_IN_MESSAGE }
  }
  if (error instanceof NotAllowedError) return { kind: 'other', message: NOT_ALLOWED_MESSAGE }
  if (!(error instanceof ApiError)) return { kind: 'other', message: UNEXPECTED_MESSAGE }
  if (error.status === 409) {
    return { kind: /email/i.test(error.message) ? 'email-taken' : 'name-in-use', message: error.message }
  }
  if (isOutage(error)) return { kind: 'other', message: UNREACHABLE_MESSAGE }
  return { kind: 'other', message: error.message }
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

export function useSignUp() {
  return useMutation({ mutationFn: (account: SignupAccount) => signUp(account) })
}
