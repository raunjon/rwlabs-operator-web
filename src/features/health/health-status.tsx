import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { gatewayHealthQuery } from './api'

const MESSAGES = {
  ok: 'Gateway reachable. All services are healthy.',
  degraded: "The gateway is up, but a service behind it isn't healthy.",
  unreachable: "Can't reach the gateway.",
} as const

const HINTS = {
  degraded: "Open the gateway's /health for the breakdown.",
  unreachable: 'Locally, check the gateway is running on port 3000. In staging, check the gateway container is up.',
} as const

export function HealthStatus() {
  const { data, isPending, isFetching, refetch } = useQuery(gatewayHealthQuery)

  if (isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Checking the gateway…
      </p>
    )
  }

  // fetchGatewayHealth never rejects, but the query type still allows an error state with no data.
  const health = data ?? 'unreachable'

  return (
    <div role="status" className="space-y-3">
      <p className={health === 'ok' ? 'text-sm' : 'text-sm text-destructive'}>{MESSAGES[health]}</p>
      {health !== 'ok' && (
        <>
          <p className="text-sm text-muted-foreground">{HINTS[health]}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            Check again
          </Button>
        </>
      )}
    </div>
  )
}
