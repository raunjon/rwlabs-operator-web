import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignupPage } from '@/features/auth/signup-page'
import { currentSession, homePath } from '@/lib/session/session'

// Public: anyone can create an organisation (OW-4, confirmed for v1).
export const Route = createFileRoute('/signup')({
  // Already signed in: there is nothing to create.
  beforeLoad: () => {
    const session = currentSession()
    if (session) throw redirect({ to: homePath(session.role), replace: true })
  },
  component: SignupPage,
})
