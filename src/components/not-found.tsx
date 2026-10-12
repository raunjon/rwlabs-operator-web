import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <main className="mx-auto max-w-xl space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">This page doesn't exist.</h1>
      <p className="text-muted-foreground">Check the address, or go back to the start page.</p>
      <Button asChild variant="outline">
        <Link to="/">Go to the start page</Link>
      </Button>
    </main>
  )
}
