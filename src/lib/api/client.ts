import createClient, { type Middleware } from 'openapi-fetch'
import { endSession, sessionToken } from '@/lib/session/session'
import { attachTenantContext } from '@/lib/session/tenant-context'
import { ApiError, NO_RESPONSE, toApiError } from './errors'
import type { paths } from './schema'
import { buildUrl } from './url'

// The two session rules every request made with a session follows: it sends the session's JWT, and a 401 on a
// request that carried one means the token expired or was revoked, which ends the session (spec §5.2). Requests
// sent without a token are left alone.
function withSession(request: Request): Request {
  const token = sessionToken()
  if (token) request.headers.set('X-Jwt-Token', token)
  return attachTenantContext(request)
}

function checkSession(request: Request, response: Response): Response {
  if (response.status === 401 && request.headers.has('X-Jwt-Token')) endSession('expired')
  return response
}

export const sessionMiddleware: Middleware = {
  onRequest: ({ request }) => withSession(request),
  onResponse: ({ request, response }) => checkSession(request, response),
}

export const REQUEST_TIMEOUT_MS = 15_000

// A JSON request with the session, for gateway routes whose request or response body the OpenAPI file doesn't
// describe (the typed client would need a cast to send one, and `data` would be `object`). Same session rules as
// `api`. Resolves to the parsed body (null when it isn't JSON); rejects with an ApiError carrying the server's
// message, or NO_RESPONSE when no answer came. GETs pass `null` as the body — no Content-Type is sent then.
export async function requestWithSession(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const hasBody = method !== 'GET' && body !== null
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (hasBody) headers['Content-Type'] = 'application/json'
  const request = withSession(
    new Request(buildUrl(path), {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    }),
  )
  let response: Response
  try {
    response = checkSession(request, await fetch(request, { signal: AbortSignal.timeout(timeoutMs) }))
  } catch {
    throw new ApiError(NO_RESPONSE, 'No response from the server')
  }
  const parsed: unknown = await response.json().catch(() => null)
  if (!response.ok) throw toApiError(response.status, parsed)
  return parsed
}

// Typed client for the gateway. Regenerate the types with `npm run api:types` when the gateway's OpenAPI changes.
// The base is resolved once at module load via buildUrl, so tests and the browser both get absolute URLs.
// fetch is looked up per call: openapi-fetch would otherwise keep the global fetch from import time, which
// bypasses anything that wraps fetch later (MSW in tests, instrumentation in the browser).
export const api = createClient<paths>({
  baseUrl: buildUrl('/').replace(/\/$/, ''),
  fetch: (request) => globalThis.fetch(request),
})
api.use(sessionMiddleware)
