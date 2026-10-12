import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  type CheckRow,
  type GatewayHealth,
  type GatewayHealthReport,
  gatewayHealthReportQuery,
  type ServiceReport,
} from './api'

export const HEALTH_POLL_MS = 60_000

const STATUS_LABELS = { ok: 'OK', degraded: 'Degraded', unreachable: 'Unreachable' } as const

// fetchGatewayHealthReport never rejects, but the query type still allows an error state with no data.
const NO_REPORT: GatewayHealthReport = { status: 'unreachable', details: null, raw: null }

const UNREACHABLE_HINT =
  'Locally, check the gateway is running on port 3000. In staging, check the gateway container is up.'

// Developer diagnostics: the gateway's /health breakdown (its own checks, then every service behind it). Polls
// every minute while open; "Check again" refreshes on demand.
export function HealthReport() {
  const { data, isPending, isFetching, refetch, dataUpdatedAt } = useQuery({
    ...gatewayHealthReportQuery,
    refetchInterval: HEALTH_POLL_MS,
  })
  const report = data ?? NO_REPORT

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-16">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">System health</h1>
        <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Start page
        </Link>
      </div>

      {isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking the gateway…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div role="status" className="flex items-center gap-3">
              <StatusBadge status={report.status} />
              <span className="text-sm text-muted-foreground">
                Last refreshed at {new Date(dataUpdatedAt).toLocaleTimeString()}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              Check again
            </Button>
          </div>

          {report.status === 'unreachable' && <p className="text-sm text-muted-foreground">{UNREACHABLE_HINT}</p>}

          {report.status !== 'unreachable' && !report.details && (
            <p className="text-sm text-muted-foreground">
              The gateway sent only its overall status. In production the breakdown needs the X-Health-Token header.
            </p>
          )}

          {report.details && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card name="gateway">
                <CheckList checks={report.details.checks} />
                <Facts facts={[['JWT secret fingerprint', report.details.jwtSecretFingerprint ?? 'none']]} />
              </Card>
              {report.details.services.map((service) => (
                <ServiceCard key={service.name} service={service} />
              ))}
            </div>
          )}

          {report.raw !== null && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Raw response</summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(report.raw, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}
    </main>
  )
}

const STATUS_BADGES = { ok: 'success', degraded: 'warning', unreachable: 'destructive' } as const

function StatusBadge({ status }: { status: GatewayHealth }) {
  return (
    <Badge variant={STATUS_BADGES[status]} className="text-sm">
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function ServiceCard({ service }: { service: ServiceReport }) {
  return (
    <Card name={service.name} status={service.status}>
      <CheckList
        checks={[
          { name: 'Reachable', ok: service.reachable },
          { name: 'JWT secret matches gateway', ok: service.jwtSecretMatchesGateway },
          ...service.checks,
        ]}
      />
      {service.httpStatus !== null && <Facts facts={[['HTTP status', String(service.httpStatus)]]} />}
    </Card>
  )
}

function Card({ name, status, children }: { name: string; status?: string; children: ReactNode }) {
  const headingId = `health-${name}`
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-medium">
          {name}
        </h2>
        {status && (
          <span className={cn('text-sm', status === 'ok' ? 'text-success' : 'text-destructive')}>{status}</span>
        )}
      </div>
      {children}
    </section>
  )
}

const CHECK_VALUES = {
  true: { mark: '✓', label: 'Pass', className: 'text-success' },
  false: { mark: '✗', label: 'Fail', className: 'text-destructive' },
  null: { mark: '–', label: 'Unknown', className: 'text-muted-foreground' },
} as const

function CheckList({ checks }: { checks: CheckRow[] }) {
  return (
    <dl className="space-y-1 text-sm">
      {checks.map((check) => {
        const value = CHECK_VALUES[String(check.ok) as keyof typeof CHECK_VALUES]
        return (
          <div key={check.name} className="flex justify-between gap-4">
            <dt className="break-all font-mono text-xs leading-5">{check.name}</dt>
            <dd className={cn('shrink-0', value.className)}>
              <span aria-hidden="true">{value.mark}</span> {value.label}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function Facts({ facts }: { facts: [string, string][] }) {
  return (
    <dl className="space-y-1 text-sm">
      {facts.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono text-xs leading-5">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
