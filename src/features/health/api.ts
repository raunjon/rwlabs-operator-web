import { queryOptions } from '@tanstack/react-query'
import { buildUrl } from '@/lib/api/url'

export type GatewayHealth = 'ok' | 'degraded' | 'unreachable'

// GET /health is the gateway's own endpoint (not the presentable envelope): { service, status: 'ok' | 'degraded' },
// HTTP 200 or 503. Anything else (network error, a proxy's HTML error page, an empty body) means we didn't reach it.
// Never rejects, so the UI always has a state to show.
export async function fetchGatewayHealth(): Promise<GatewayHealth> {
  try {
    const response = await fetch(buildUrl('/health'), { headers: { Accept: 'application/json' } })
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
  queryFn: fetchGatewayHealth,
})
