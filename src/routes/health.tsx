import { createFileRoute, notFound } from '@tanstack/react-router'
import { config } from '@/config'
import { HealthReport } from '@/features/health/health-report'

// /health is also the gateway's JSON health check: the dev proxy (vite.proxy.ts) and nginx send browsers here and
// every other request to the gateway, by the Accept header.
export const Route = createFileRoute('/health')({
  // Internal page: not served in production builds (config.showInternalPages).
  beforeLoad: () => {
    if (!config.showInternalPages) throw notFound()
  },
  component: HealthReport,
})
