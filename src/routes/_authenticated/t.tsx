import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { homePath } from '@/lib/session/session'

// Tenant area: tenant admins only. A super admin who opens a /t link is sent to their own area.
export const Route = createFileRoute('/_authenticated/t')({
  beforeLoad: ({ context }) => {
    if (context.session.role !== 'admin') throw redirect({ to: homePath(context.session.role) })
  },
  component: () => (
    <AppShell area="Organisation" nav={[{ label: 'Home', to: '/t' }]}>
      <Outlet />
    </AppShell>
  ),
})
