import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { buildUrl } from './url'

// Typed client for the gateway. Regenerate the types with `npm run api:types` when the gateway's OpenAPI changes.
// The base is resolved once at module load via buildUrl, so tests and the browser both get absolute URLs.
// fetch is looked up per call: openapi-fetch would otherwise keep the global fetch from import time, which
// bypasses anything that wraps fetch later (MSW in tests, instrumentation in the browser).
export const api = createClient<paths>({
  baseUrl: buildUrl('/').replace(/\/$/, ''),
  fetch: (request) => globalThis.fetch(request),
})
