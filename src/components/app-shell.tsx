import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { config } from '@/config'
import { signOut } from '@/features/auth/session-actions'
import { useSession } from '@/lib/session/session'

export interface NavItem {
  label: string
  to: '/t' | '/admin'
}

// The frame around every signed-in page: sidebar with the area's navigation, the signed-in user and sign-out, and
// the main content. Used by both the tenant (/t) and super-admin (/admin) areas.
export function AppShell({ area, nav, children }: { area: string; nav: NavItem[]; children: ReactNode }) {
  const session = useSession()
  const [signingOut, setSigningOut] = useState(false)
  const name = [session?.firstName, session?.lastName].filter(Boolean).join(' ') || session?.email

  async function handleSignOut() {
    setSigningOut(true)
    // The authenticated layout returns to the login page once the session ends.
    await signOut()
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col gap-6 border-b bg-card p-4 md:sticky md:top-0 md:h-dvh md:border-r md:border-b-0">
        <div className="space-y-0.5 px-2">
          <p className="font-semibold">{config.productName} Operator</p>
          <p className="text-xs text-muted-foreground">{area}</p>
        </div>
        <nav aria-label="Main">
          <ul className="space-y-1">
            {nav.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: true }}
                  className="block rounded-sm px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-secondary data-[status=active]:text-secondary-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto space-y-3">
          <div className="px-2 text-sm">
            <p className="font-medium">{name}</p>
            {session?.roleDisplayName && <p className="text-muted-foreground">{session.roleDisplayName}</p>}
          </div>
          <ThemeToggle className="w-full [&>label]:flex-1 [&>label]:text-center" />
          <Button variant="outline" className="w-full" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        {/* Slot for an "Acting as …" banner when act-as-tenant arrives (spec §5.3). Empty in v1. */}
        <main className="flex-1 px-6 py-8 md:px-10">{children}</main>
      </div>
    </div>
  )
}
