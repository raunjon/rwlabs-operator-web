import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import {
  requestCreateFacebookCredential,
  requestFacebookAuthorizeUrl,
  requestFacebookPages,
  type FacebookLoginReturn,
  type NewFacebookCredential,
} from './api'
import { META_UNREACHABLE_MESSAGE, metaPagesQuery } from './meta-settings'

// The relative path on the panel the Facebook OAuth popup redirects back to. Must be registered as an allowed
// redirect URI on the Meta App (per environment). Deliberately public (NOT under /_authenticated) because the
// popup opens as a fresh browsing context without the admin's session JWT — see src/routes/meta/facebook.callback.
export const FACEBOOK_CALLBACK_PATH = '/meta/facebook/callback'

// Builds the absolute redirect_uri the panel sends to the backend. The backend signs it into the state_token and
// Meta compares it on exchange, so this must match byte-for-byte between the authorize call and the pages call.
export function facebookRedirectUri(origin: string = window.location.origin): string {
  return `${origin}${FACEBOOK_CALLBACK_PATH}`
}

// Shape of the message the callback route posts to its opener window. The event's `origin` must equal the panel's
// own origin before the opener acts on it (postMessage security).
export const FACEBOOK_CALLBACK_MESSAGE_TYPE = 'facebook-login-callback'
export interface FacebookCallbackMessage {
  type: typeof FACEBOOK_CALLBACK_MESSAGE_TYPE
  code: string | null
  stateToken: string | null
}

export function isFacebookCallbackMessage(value: unknown): value is FacebookCallbackMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === FACEBOOK_CALLBACK_MESSAGE_TYPE
  )
}

// Shown when the admin (or Facebook) returns without a code — "cancelled". Neutral, not destructive.
export const FACEBOOK_CANCELLED_MESSAGE = 'Facebook login was cancelled, so nothing was connected.'

// Shown when the stashed session_id expired or was already used. The UI drops back to the Log in with Facebook
// button so the admin can start over.
export const FACEBOOK_SESSION_EXPIRED_MESSAGE = 'Your Facebook login has expired. Log in again to continue.'

// Shown when the admin's Facebook account manages no Pages at all.
export const FACEBOOK_NO_PAGES_MESSAGE =
  'This Facebook account doesn’t manage any Pages, so there’s nothing to connect.'

// Shown when the Meta service has no Facebook App configured (`META_APP_ID`/`SECRET` empty). Defensive: the panel
// also hides the button via `facebookLoginAvailable`.
export const FACEBOOK_UNCONFIGURED_MESSAGE = 'Facebook login isn’t configured in this environment.'

export type FacebookFailure =
  // 410 or Meta-service "session has expired": go back to the button.
  | { kind: 'session-expired'; message: string }
  // 503 from authorize_url: the Meta service isn't configured for Facebook login at all.
  | { kind: 'unconfigured'; message: string }
  // 502 from the operator: Meta service failing or unreachable (not us).
  | { kind: 'meta-unreachable'; message: string }
  // No answer from the gateway, or 5xx not 502.
  | { kind: 'outage'; message: string }
  // 403: non-admin tried to use the flow (shouldn't happen; the admin guard on /t covers it, but defence in depth).
  | { kind: 'not-allowed'; message: string }
  // 422 with a server message: Meta's own rejection or a Rails validation. Server wording passes through.
  | { kind: 'other'; message: string }

const NOT_ALLOWED_MESSAGE = 'You don’t have access to this.'
const UNEXPECTED_MESSAGE = 'Something went wrong. Try again.'

// What the Facebook-login flow shows for a failed request. Codes come from the operator pass-through contract in
// OS-34: pass-through 2xx/404/410/422, Meta transport or 5xx → 502, missing session JWT → gateway's 400/401.
export function facebookFailure(error: unknown): FacebookFailure {
  if (!(error instanceof ApiError)) return { kind: 'other', message: UNEXPECTED_MESSAGE }
  if (error.status === 403) return { kind: 'not-allowed', message: NOT_ALLOWED_MESSAGE }
  if (error.status === 503) return { kind: 'unconfigured', message: FACEBOOK_UNCONFIGURED_MESSAGE }
  if (error.status === 410) return { kind: 'session-expired', message: FACEBOOK_SESSION_EXPIRED_MESSAGE }
  if (error.status === 502) return { kind: 'meta-unreachable', message: META_UNREACHABLE_MESSAGE }
  if (error.status === NO_RESPONSE || error.status >= 500) return { kind: 'outage', message: UNREACHABLE_MESSAGE }
  return { kind: 'other', message: error.message }
}

// Not a mutation hook because `authorize_url` is just a one-off GET right before opening the popup; `useMutation`
// would give us useful .isPending / .error state though. Using it for consistency with the rest.
export function useFacebookAuthorizeUrl() {
  return useMutation({ mutationFn: (redirectUri: string) => requestFacebookAuthorizeUrl(redirectUri) })
}

export function useFacebookPages() {
  return useMutation({ mutationFn: (input: FacebookLoginReturn) => requestFacebookPages(input) })
}

export function useCreateFacebookCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewFacebookCredential) => requestCreateFacebookCredential(input),
    // Same invalidation as the manual add path from OW-10: refresh the pages list so the new credential appears.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: metaPagesQuery.queryKey }),
  })
}
