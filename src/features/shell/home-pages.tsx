import type { ReactNode } from 'react'
import { Card, CardDescription, CardHeader } from '@/components/ui/card'
import { InviteCard } from '@/features/team/invite-card'
import { useSession } from '@/lib/session/session'

// Placeholder landing pages for the two areas until their features arrive (events, leads, tenants, ...).

export function TenantHome() {
  return (
    <HomePage
      title="Your organisation"
      description="Events, venues, leads and settings will appear in the sidebar as they're added."
    >
      <InviteCard />
    </HomePage>
  )
}

export function AdminHome() {
  return (
    <HomePage
      title="Super admin"
      description="Tenant management will appear in the sidebar as it's added."
    />
  )
}

function HomePage({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  const session = useSession()
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        <h1 className="text-2xl font-semibold">Welcome{session?.firstName ? `, ${session.firstName}` : ''}</h1>
      </div>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Nothing here yet</h2>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
      {children}
    </div>
  )
}
