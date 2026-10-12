import createClient, { type Middleware } from 'openapi-fetch'
import { endSession, sessionToken } from '@/lib/session/session'
import { attachTenantContext } from '@/lib/session/tenant-context'
import type { paths } from './schema'
import { buildUrl } from './url'

// Sends the session's JWT, and ends the session when the gateway rejects it: a 401 on a request that carried a
// token means it expired or was revoked (spec §5.2). Requests sent without a token (none today) are left alone.
export const sessionMiddleware: Middleware = {
  onRequest({ request }) {
    const token = sessionToken()
    if (token) request.headers.set('X-Jwt-Token', token)
    return attachTenantContext(request)
  },
  onResponse({ request, response }) {
    if (response.status === 401 && request.headers.has('X-Jwt-Token')) endSession('expired')
    return response
  },
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
