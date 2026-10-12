import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthenticatedLayout } from '@/features/auth/authenticated-layout'
import { currentSession, sessionEndReason } from '@/lib/session/session'

// Every signed-in page sits under this layout. Signed out (or expired) on arrival: off to the login page, keeping
// the page asked for so sign-in can return to it.
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const session = currentSession()
    if (!session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href, reason: sessionEndReason() === 'expired' ? 'expired' : undefined },
      })
    }
    return { session }
  },
  component: AuthenticatedLayout,
})
