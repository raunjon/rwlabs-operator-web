import { Link } from '@tanstack/react-router'
import { config } from '@/config'
import { HealthStatus } from '@/features/health/health-status'

export function HelloPage() {
  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{config.productName} Operator</h1>
      <p className="text-muted-foreground">Hello world. The operator panel is running.</p>
      <HealthStatus />
      <nav className="flex gap-4 text-sm">
        <Link to="/health" className="text-muted-foreground underline-offset-4 hover:underline">
          System health details
        </Link>
        <Link to="/style-guide" className="text-muted-foreground underline-offset-4 hover:underline">
          Style guide
        </Link>
      </nav>
    </main>
  )
}
