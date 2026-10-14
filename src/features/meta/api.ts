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
}

function readConnection(body: unknown): MetaConnection {
  const data = envelopeData(body)
  if (!data) throw new ApiError(200, 'The server sent an unexpected response')
  return { connected: data.connected === true, connectedAt: parseTimestamp(data.connected_at) }
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
