import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { homePath } from '@/lib/session/session'

// Super-admin area: super admins only. A tenant admin who opens an /admin link is sent to their own area.
export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: ({ context }) => {
    if (context.session.role !== 'super_admin') throw redirect({ to: homePath(context.session.role) })
  },
  component: () => (
    <AppShell area="Super admin" nav={[{ label: 'Home', to: '/admin' }]}>
      <Outlet />
    </AppShell>
  ),
})
