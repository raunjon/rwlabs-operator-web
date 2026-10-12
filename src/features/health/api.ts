import { queryOptions } from '@tanstack/react-query'
import { buildUrl } from '@/lib/api/url'

export type GatewayHealth = 'ok' | 'degraded' | 'unreachable'

// GET /health is the gateway's own endpoint (not the presentable envelope): { service, status: 'ok' | 'degraded' },
// HTTP 200 or 503. Anything else (network error, a proxy's HTML error page, an empty body) means we didn't reach it.
// Never rejects, so the UI always has a state to show.
//
// Gives up after HEALTH_TIMEOUT_MS: a gateway that accepts the connection but never answers (stuck worker, debugger
// breakpoint, unreachable staging host) must end as 'unreachable', not leave the page on "Checking" forever. Kept
// above the ~6s the gateway's own /health can legitimately take (two sequential 3s service checks).
export const HEALTH_TIMEOUT_MS = 10_000

export async function fetchGatewayHealth(timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<GatewayHealth> {
  try {
    const response = await fetch(buildUrl('/health'), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body: unknown = await response.json().catch(() => null)
    if (typeof body !== 'object' || body === null || !('status' in body)) return 'unreachable'
    if (body.status === 'ok' && response.ok) return 'ok'
    if (body.status === 'degraded') return 'degraded'
    return 'unreachable'
  } catch {
    return 'unreachable'
  }
}

export const gatewayHealthQuery = queryOptions({
  queryKey: ['gateway-health'],
  queryFn: () => fetchGatewayHealth(),
})
