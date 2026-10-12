import { ApiError, toApiError } from '@/lib/api/errors'
import { buildUrl } from '@/lib/api/url'
import { deviceHeaders } from '@/lib/session/device'

// Sign-in and sign-out talk to the gateway with fetch + buildUrl rather than the typed `api` client: the gateway's
// OpenAPI file doesn't describe login's body or its ?jwt=true variant, and casting around that would hide real
// type errors. Neither call goes through the client's 401 handling, which is for requests made with a session.

export const SIGN_IN_TIMEOUT_MS = 15_000
export const SIGN_OUT_TIMEOUT_MS = 5_000

// status 0: the request never got an answer (offline, gateway down, timed out).
export const NO_RESPONSE = 0

// POST /auth/api/login?jwt=true with the device headers. Resolves to the gateway JWT; rejects with an ApiError
// carrying the server's message (wrong password is a 401, a suspended organisation a 403).
export async function requestSignIn(
  email: string,
  password: string,
  timeoutMs: number = SIGN_IN_TIMEOUT_MS,
): Promise<string> {
  let response: Response
  try {
    response = await fetch(buildUrl('/auth/api/login?jwt=true'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...deviceHeaders() },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new ApiError(NO_RESPONSE, 'No response from the server')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(response.status, body)
  const jwt = typeof body === 'object' && body !== null && 'jwt' in body ? body.jwt : undefined
  if (typeof jwt !== 'string' || !jwt) throw new ApiError(response.status, 'The server sent an unexpected response')
  return jwt
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
