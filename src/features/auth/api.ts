import { ApiError, toApiError } from '@/lib/api/errors'
import { buildUrl } from '@/lib/api/url'
import { deviceHeaders } from '@/lib/session/device'
import { parseTimestamp } from '@/lib/session/jwt'

// Sign-in, sign-up, invitations and sign-out talk to the gateway with fetch + buildUrl rather than the typed
// `api` client: the gateway's OpenAPI file doesn't describe login's body or its ?jwt=true variant, signup's and
// accept's bodies, or lookup's ?token=, and casting around that would hide real type errors. None of these calls
// goes through the client's 401 handling, which is for requests made with a session.

export const SIGN_IN_TIMEOUT_MS = 15_000
export const SIGN_OUT_TIMEOUT_MS = 5_000

// status 0: the request never got an answer (offline, gateway down, timed out).
export const NO_RESPONSE = 0

// A request made before there is a session. Resolves to the parsed body (null when it isn't JSON); rejects with
// an ApiError carrying the server's message, or NO_RESPONSE.
async function requestWithoutSession(path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(buildUrl(path), { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new ApiError(NO_RESPONSE, 'No response from the server')
  }
  const parsed: unknown = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(response.status, parsed)
  return parsed
}

// A JSON POST with the device headers auth requires when it issues a token.
function postWithoutSession(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  return requestWithoutSession(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...deviceHeaders() },
      body: JSON.stringify(body),
    },
    timeoutMs,
  )
}

// The `data` of a presentable envelope, when it is an object.
function envelopeData(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || !('data' in body)) return null
  const { data } = body as { data: unknown }
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

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

// What an invitation link is for, from GET /auth/api/invitations/lookup?token=. Rejects with a 404 when the link
// is unknown, used, revoked, expired or for a suspended organisation (auth gives the same answer for all of them).
export interface InvitationLookup {
  email: string
  role: string
  tenantName: string
  // Milliseconds since the epoch, or null when the server doesn't say.
  expiresAt: number | null
}

export async function requestInvitationLookup(
  token: string,
  timeoutMs: number = SIGN_IN_TIMEOUT_MS,
): Promise<InvitationLookup> {
  const query = new URLSearchParams({ token })
  const body = await requestWithoutSession(
    `/auth/api/invitations/lookup?${query}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    timeoutMs,
  )
  const data = envelopeData(body)
  if (!data || !text(data.email)) throw new ApiError(200, 'The server sent an unexpected response')
  return {
    email: text(data.email),
    role: text(data.role),
    tenantName: text(data.tenant_name),
    expiresAt: parseTimestamp(data.expires_at),
  }
}

export interface InvitationAcceptance {
  token: string
  firstName: string
  lastName: string
  password: string
}

// POST /auth/api/invitations/accept: creates the invitee's account with the invitation's email and role. As with
// signup the gateway answers with auth's token digest, so the caller signs in afterwards. Rejects with the
// server's message: 404 when the link is no longer usable, 409 when the email became an account meanwhile, 422
// for invalid fields.
export async function requestAcceptInvitation(
  acceptance: InvitationAcceptance,
  timeoutMs: number = SIGN_IN_TIMEOUT_MS,
): Promise<void> {
  await postWithoutSession(
    '/auth/api/invitations/accept',
    {
      token: acceptance.token,
      first_name: acceptance.firstName,
      last_name: acceptance.lastName,
      password: acceptance.password,
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
