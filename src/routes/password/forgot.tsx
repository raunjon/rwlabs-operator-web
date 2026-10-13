import { createFileRoute, redirect } from '@tanstack/react-router'
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page'
import { currentSession, homePath } from '@/lib/session/session'

// Public: anyone who's forgotten their password can start a reset (OW-6).
export const Route = createFileRoute('/password/forgot')({
  // Already signed in: there's nothing to recover.
  beforeLoad: () => {
    const session = currentSession()
    if (session) throw redirect({ to: homePath(session.role), replace: true })
  },
  component: ForgotPasswordPage,
})
