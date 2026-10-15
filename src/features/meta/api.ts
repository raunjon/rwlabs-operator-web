import { requestWithSession } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import { parseTimestamp } from '@/lib/session/jwt'

// The Meta endpoints are a pass-through to rwlabs_meta_service: the gateway's OpenAPI file names the routes but
// leaves request and response bodies as plain `object`, so these wrappers parse the envelope by hand and go
// through requestWithSession (same session rules as the typed client; it also ends the session on 401). The page
// access token is write-only — the Meta service strips it from its own as_json, the operator controller never
// echoes it, and Rails' default filter_parameters scrubs it from logs. Nothing in this module caches, logs or
// returns a token.

const text = (value: unknown) => (typeof value === 'string' ? value : '')

function envelopeData(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || !('data' in body)) return null
  const { data } = body as { data: unknown }
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null
}

function envelopeList(body: unknown): unknown[] | null {
  if (typeof body !== 'object' || body === null || !('data' in body)) return null
  const { data } = body as { data: unknown }
  return Array.isArray(data) ? data : null
}

export interface MetaConnection {
  connected: boolean
  // Milliseconds since the epoch when the organisation first connected, or null when it isn't connected or the
  // server doesn't say.
  connectedAt: number | null
  // OW-13: whether the panel should show the "Log in with Facebook" button on the Meta settings page. True iff the
  // Meta service reports Facebook login configured (`META_APP_ID`/`META_APP_SECRET` set); false when it isn't,
  // or when the probe to the Meta service failed. The gateway's OpenAPI doesn't declare this field, so parse by
  // hand rather than relying on the typed schema.
  facebookLoginAvailable: boolean
}

function readConnection(body: unknown): MetaConnection {
  const data = envelopeData(body)
  if (!data) throw new ApiError(200, 'The server sent an unexpected response')
  return {
    connected: data.connected === true,
    connectedAt: parseTimestamp(data.connected_at),
    facebookLoginAvailable: data.facebook_login_available === true,
  }
}

// GET /operator/api/meta_connection: whether the signed-in tenant has a Meta credential. Tenant admins only;
// other roles get 403 via CanCan.
export async function fetchMetaConnection(): Promise<MetaConnection> {
  return readConnection(await requestWithSession('GET', '/operator/api/meta_connection', null))
}

// POST /operator/api/meta_connection: idempotent — provisions a Meta Account and stores its API key the first
// time, and just returns the existing connection state on repeat calls.
export async function requestConnectToMeta(): Promise<MetaConnection> {
  const body = await requestWithSession('POST', '/operator/api/meta_connection', {})
  return readConnection(body)
}

export interface MetaPage {
  // The TenantCredential id, used by PATCH /operator/api/meta_credentials/{id}.
  id: string
  label: string
  // Facebook page id (opaque numeric string from Meta).
  pageId: string
  // The ad account id tied to this page, or null when the admin hasn't set one — ads then aren't available for it.
  adAccountId: string | null
}

function readPage(data: Record<string, unknown>): MetaPage {
  const id = data.id
  return {
    id: id === null || id === undefined ? '' : String(id),
    label: text(data.label),
    pageId: text(data.page_id),
    adAccountId: text(data.ad_account_id) || null,
  }
}

// GET /operator/api/meta_credentials: the organisation's connected Facebook pages. Rejects with 422
// "Tenant has no Meta connection" when the connect step hasn't been done yet.
export async function fetchMetaPages(): Promise<MetaPage[]> {
  const list = envelopeList(await requestWithSession('GET', '/operator/api/meta_credentials', null))
  if (!list) throw new ApiError(200, 'The server sent an unexpected response')
  return list
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map(readPage)
}

export interface NewMetaPage {
  label: string
  pageId: string
  pageAccessToken: string
  adAccountId: string | null
}

// POST /operator/api/meta_credentials: adds a Facebook page by passing the token through to the Meta service,
// which debugs it against Graph before storing it encrypted. Rejects with 422 for a bad token or missing fields,
// 404 when Meta doesn't know the page id for this tenant's account, 502 when the Meta service itself is failing
// or unreachable.
export async function requestCreateMetaPage(page: NewMetaPage): Promise<MetaPage> {
  const body = await requestWithSession('POST', '/operator/api/meta_credentials', {
    label: page.label,
    page_id: page.pageId,
    page_access_token: page.pageAccessToken,
    ad_account_id: page.adAccountId,
  })
  const data = envelopeData(body)
  if (!data) throw new ApiError(200, 'The server sent an unexpected response')
  return readPage(data)
}

// ---------------------------------------------------------------------------
// Facebook login (OW-13 / OS-34 / META-17)
//
// Three endpoints under `/operator/api/facebook_login/*`. Flow:
//   1. GET  authorize_url    → open Facebook's dialog in a popup
//   2. POST pages            → swap code → user_token (held server-side), list Pages
//   3. POST credentials      → fetch the Page token server-side, create the MetaCredential
//
// The Facebook user token never leaves the Meta service. The panel only ever handles the
// opaque `session_id` returned by `pages` and the pages themselves (id + name).
// ---------------------------------------------------------------------------

export interface FacebookAuthorizeUrl {
  // The Facebook OAuth dialog URL to open in the login popup. Signed server-side; carries the admin's account id
  // and the redirect_uri as a short-lived state_token in the query.
  authorizeUrl: string
  // The signed state value the panel must send back when exchanging the OAuth code for a Pages list, so the Meta
  // service can prove the request matches the one it issued.
  stateToken: string
}

// GET /operator/api/facebook_login/authorize_url?redirect_uri= : asks for the Facebook OAuth dialog URL. 503 when
// the Meta service has no Facebook App configured (`META_APP_ID`/`SECRET` empty) — the panel hides the button in
// that case via `facebookLoginAvailable`, so a 503 here is defensive.
export async function requestFacebookAuthorizeUrl(redirectUri: string): Promise<FacebookAuthorizeUrl> {
  const query = new URLSearchParams({ redirect_uri: redirectUri })
  const body = await requestWithSession('GET', `/operator/api/facebook_login/authorize_url?${query}`, null)
  const data = envelopeData(body)
  if (!data || !text(data.authorize_url) || !text(data.state_token)) {
    throw new ApiError(200, 'The server sent an unexpected response')
  }
  return { authorizeUrl: text(data.authorize_url), stateToken: text(data.state_token) }
}

export interface FacebookLoginReturn {
  code: string
  stateToken: string
  // The exact redirect_uri the authorize call was made with. Meta verifies it matches on the exchange.
  redirectUri: string
}

export interface FacebookPage {
  // Facebook's page id (opaque numeric string).
  id: string
  // Page name as the admin sees it on Facebook.
  name: string
}

// The Meta service's `/me/accounts` call only returns pages the admin manages at a role level, so every entry
// here is a candidate to connect. The Page access token is fetched server-side at the credentials step; if Meta
// refuses to grant it (role too weak, permission declined), the server returns 422 which the UI surfaces via
// `facebookFailure`.

export interface FacebookPagesResult {
  // Opaque one-shot id for the follow-up POST credentials. Expires after a short TTL (10 min) and is destroyed on
  // use, so the panel can't connect two pages from one login.
  sessionId: string
  pages: FacebookPage[]
}

function readFacebookPage(data: Record<string, unknown>): FacebookPage {
  return {
    id: text(data.id),
    name: text(data.name),
  }
}

// POST /operator/api/facebook_login/pages : exchanges the OAuth code for a server-side user token (not returned)
// and the list of Pages the user manages. Rejects with 422 for a verification failure, Meta rejection, or a
// cancelled login; 410 when the state has already been used; 502 when the Meta service itself is failing.
export async function requestFacebookPages(input: FacebookLoginReturn): Promise<FacebookPagesResult> {
  const body = await requestWithSession('POST', '/operator/api/facebook_login/pages', {
    code: input.code,
    redirect_uri: input.redirectUri,
    state_token: input.stateToken,
  })
  const data = envelopeData(body)
  if (!data || !text(data.session_id)) throw new ApiError(200, 'The server sent an unexpected response')
  const list = Array.isArray(data.pages) ? (data.pages as unknown[]) : []
  const pages = list
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map(readFacebookPage)
  return { sessionId: text(data.session_id), pages }
}

export interface NewFacebookCredential {
  sessionId: string
  pageId: string
  // Optional label; when omitted the server defaults to the Page name.
  label: string | null
  // Optional ad account; the Facebook flow doesn't offer it (the panel's manual-form Edit does), so always null
  // from this flow. Kept here for symmetry with the server's accepted shape.
  adAccountId: string | null
}

// POST /operator/api/facebook_login/credentials : fetches the Page's access token server-side (using the stashed
// user token from `pages`), creates the MetaCredential. Returns the credential in the same shape as the manual
// POST /operator/api/meta_credentials. 410 when the session_id has expired/been used (go back to the Log in with
// Facebook button); 422 when Meta rejects the token or the Rails validation fails.
export async function requestCreateFacebookCredential(input: NewFacebookCredential): Promise<MetaPage> {
  const payload: Record<string, unknown> = { session_id: input.sessionId, page_id: input.pageId }
  if (input.label) payload.label = input.label
  if (input.adAccountId) payload.ad_account_id = input.adAccountId
  const body = await requestWithSession('POST', '/operator/api/facebook_login/credentials', payload)
  const data = envelopeData(body)
  if (!data) throw new ApiError(200, 'The server sent an unexpected response')
  return readPage(data)
}

export interface UpdateMetaPage {
  label: string
  adAccountId: string | null
  // When null, the token is left as-is (the field is write-only, so this field also never comes back from the
  // server). Set it to a non-empty string to replace the stored token.
  pageAccessToken: string | null
}

// PATCH /operator/api/meta_credentials/{id}: changes the label and ad account, optionally replacing the token
// (the Meta service debugs the new one first). The page id can't be changed — the admin removes and re-adds the
// page to point at a different Facebook page (removal is a later ticket).
export async function requestUpdateMetaPage(id: string, update: UpdateMetaPage): Promise<MetaPage> {
  const payload: Record<string, unknown> = { label: update.label, ad_account_id: update.adAccountId }
  if (update.pageAccessToken) payload.page_access_token = update.pageAccessToken
  const body = await requestWithSession('PATCH', `/operator/api/meta_credentials/${encodeURIComponent(id)}`, payload)
  const data = envelopeData(body)
  if (!data) throw new ApiError(200, 'The server sent an unexpected response')
  return readPage(data)
}
