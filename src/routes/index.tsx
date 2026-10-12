import { createFileRoute, redirect } from '@tanstack/react-router'
import { currentSession, homePath } from '@/lib/session/session'

// "/" has no page of its own: signed-in users go to their area, everyone else to the login page.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const session = currentSession()
    throw redirect(session ? { to: homePath(session.role) } : { to: '/login', search: {} })
  },
})
