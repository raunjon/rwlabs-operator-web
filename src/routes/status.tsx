import { createFileRoute } from '@tanstack/react-router'
import { HealthReport } from '@/features/health/health-report'

// Not /health: that path is proxied to the gateway (vite.proxy.ts, nginx), so it would never reach the SPA.
export const Route = createFileRoute('/status')({
  component: HealthReport,
})
