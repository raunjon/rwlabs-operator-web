import { createFileRoute } from '@tanstack/react-router'
import { HealthReport } from '@/features/health/health-report'

// /health is also the gateway's JSON health check: the dev proxy (vite.proxy.ts) and nginx send browsers here and
// every other request to the gateway, by the Accept header.
export const Route = createFileRoute('/health')({
  component: HealthReport,
})
