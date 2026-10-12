import { ApiError, toApiError } from '@/lib/api/errors'
import { buildUrl } from '@/lib/api/url'
import { deviceHeaders } from '@/lib/session/device'

// Sign-in, sign-up and sign-out talk to the gateway with fetch + buildUrl rather than the typed `api` client: the
// gateway's OpenAPI file doesn't describe login's body or its ?jwt=true variant, nor signup's body, and casting
// around that would hide real type errors. None of these calls goes through the client's 401 handling, which is
// for requests made with a session.

export const SIGN_IN_TIMEOUT_MS = 15_000
export const SIGN_OUT_TIMEOUT_MS = 5_000

// status 0: the request never got an answer (offline, gateway down, timed out).
export const NO_RESPONSE = 0

// A JSON POST made before there is a session, with the device headers auth requires. Resolves to the parsed body
// (null when it isn't JSON); rejects with an ApiError carrying the server's message, or NO_RESPONSE.
async function postWithoutSession(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...deviceHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new ApiError(NO_RESPONSE, 'No response from the server')
  }
  const parsed: unknown = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(response.status, parsed)
  return parsed
}

// POST /auth/api/login?jwt=true with the device headers. Resolves to the gateway JWT; rejects with an ApiError
// carrying the server's message (wrong password is a 401, a suspended organisation a 403).
export async function requestSignIn(
  email: string,
  password: string,
  timeoutMs: number = SIGN_IN_TIMEOUT_MS,
): Promise<string> {
  const body = await postWithoutSession('/auth/api/login?jwt=true', { email, password }, timeoutMs)
  const jwt = typeof body === 'object' && body !== null && 'jwt' in body ? body.jwt : undefined
  if (typeof jwt !== 'string' || !jwt) throw new ApiError(200, 'The server sent an unexpected response')
  return jwt
}

export interface SignupAccount {
  tenantName: string
  firstName: string
  lastName: string
  email: string
  password: string
}

// POST /auth/api/operators/signup: creates the organisation and its first admin. The gateway answers with auth's
// token digest, not a gateway JWT, so the caller signs in afterwards to get a session; the digest is ignored here
// rather than handed around. Rejects with the server's message: a taken email or a clashing organisation name is
// a 409, invalid fields a 422 with one joined message.
export async function requestSignUp(account: SignupAccount, timeoutMs: number = SIGN_IN_TIMEOUT_MS): Promise<void> {
  await postWithoutSession(
    '/auth/api/operators/signup',
    {
      tenant_name: account.tenantName,
      first_name: account.firstName,
      last_name: account.lastName,
      email: account.email,
      password: account.password,
    },
    timeoutMs,
  )
}

// POST /auth/api/logout so the server revokes the token. Best effort: never rejects and gives up after a few
// seconds; callers clear the local session before calling (spec §5.2). keepalive lets the request finish even if
// the user reloads or leaves the page straight after signing out.
export async function requestSignOut(token: string, timeoutMs: number = SIGN_OUT_TIMEOUT_MS): Promise<void> {
  try {
    await fetch(buildUrl('/auth/api/logout'), {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Jwt-Token': token },
      keepalive: true,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    // Offline, timed out or refused: the local session is cleared regardless.
  }
}
