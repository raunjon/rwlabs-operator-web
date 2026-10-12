import { queryOptions } from '@tanstack/react-query'
import { buildUrl } from '@/lib/api/url'

export type GatewayHealth = 'ok' | 'degraded' | 'unreachable'

// One row of a breakdown. Nested checks ({ secrets: { RAILS_JWT_SECRET: true } }) are flattened into names joined
// with " › ". ok is null when the value isn't a boolean (null, or something the gateway added that we don't know).
export interface CheckRow {
  name: string
  ok: boolean | null
}

export interface ServiceReport {
  name: string
  reachable: boolean
  httpStatus: number | null
  status: string
  // null when the service sent no fingerprint (its breakdown was hidden from the gateway, or it has no secret)
  jwtSecretMatchesGateway: boolean | null
  checks: CheckRow[]
}

export interface GatewayHealthReport {
  status: GatewayHealth
  // null when the gateway only sent the overall status (production without X-Health-Token) or wasn't reached
  details: { checks: CheckRow[]; jwtSecretFingerprint: string | null; services: ServiceReport[] } | null
  // The parsed JSON body as received, or null if there was none
  raw: unknown
}

// GET /health is the gateway's own endpoint (not the presentable envelope): { service, status: 'ok' | 'degraded' },
// HTTP 200 or 503, plus checks / jwt_secret_fingerprint / services outside production. Anything else (network error,
// a proxy's HTML error page, an empty body) means we didn't reach it. Never rejects, so the UI always has a state to
// show.
//
// Gives up after HEALTH_TIMEOUT_MS: a gateway that accepts the connection but never answers (stuck worker, debugger
// breakpoint, unreachable staging host) must end as 'unreachable', not leave the page on "Checking" forever. Kept
// above the ~6s the gateway's own /health can legitimately take (two sequential 3s service checks).
export const HEALTH_TIMEOUT_MS = 10_000

export async function fetchGatewayHealthReport(timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<GatewayHealthReport> {
  try {
    const response = await fetch(buildUrl('/health'), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body: unknown = await response.json().catch(() => null)
    if (!isObject(body) || !('status' in body)) return { status: 'unreachable', details: null, raw: body }

    let status: GatewayHealth = 'unreachable'
    if (body.status === 'ok' && response.ok) status = 'ok'
    else if (body.status === 'degraded') status = 'degraded'
    return { status, details: status === 'unreachable' ? null : parseDetails(body), raw: body }
  } catch {
    return { status: 'unreachable', details: null, raw: null }
  }
}

export async function fetchGatewayHealth(timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<GatewayHealth> {
  return (await fetchGatewayHealthReport(timeoutMs)).status
}

function parseDetails(body: Record<string, unknown>): GatewayHealthReport['details'] {
  if (!isObject(body.checks) && !isObject(body.services)) return null

  const services = Object.entries(isObject(body.services) ? body.services : {}).map(
    ([name, value]): ServiceReport => {
      const service = isObject(value) ? value : {}
      return {
        name,
        reachable: service.reachable === true,
        httpStatus: typeof service.http_status === 'number' ? service.http_status : null,
        status: typeof service.status === 'string' ? service.status : 'unknown',
        jwtSecretMatchesGateway:
          typeof service.jwt_secret_matches_gateway === 'boolean' ? service.jwt_secret_matches_gateway : null,
        checks: flattenChecks(service.checks),
      }
    },
  )
  return {
    checks: flattenChecks(body.checks),
    jwtSecretFingerprint: typeof body.jwt_secret_fingerprint === 'string' ? body.jwt_secret_fingerprint : null,
    services,
  }
}

function flattenChecks(value: unknown, prefix = ''): CheckRow[] {
  if (!isObject(value)) return []
  return Object.entries(value).flatMap(([key, child]) => {
    const name = prefix ? `${prefix} › ${key}` : key
    if (isObject(child)) return flattenChecks(child, name)
    return [{ name, ok: typeof child === 'boolean' ? child : null }]
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// One query for both the start page's one-liner and the status page, so moving between them reuses the result.
export const gatewayHealthReportQuery = queryOptions({
  queryKey: ['gateway-health'],
  queryFn: () => fetchGatewayHealthReport(),
})

export const gatewayHealthQuery = queryOptions({
  ...gatewayHealthReportQuery,
  select: (report: GatewayHealthReport) => report.status,
})
