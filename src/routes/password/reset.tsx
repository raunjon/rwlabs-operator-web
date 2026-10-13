import { createFileRoute, redirect } from '@tanstack/react-router'
import { ResetPasswordPage } from '@/features/auth/reset-password-page'
import { currentSession, homePath } from '@/lib/session/session'

export interface ResetPasswordSearch {
  // The raw reset token from the email link; missing or empty means the link is unusable.
  token?: string
}

// Public: the password reset email links here (OW-6). The path and ?token= are fixed by auth's email template,
// so neither must change.
export const Route = createFileRoute('/password/reset')({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === 'string' && search.token ? search.token : undefined,
  }),
  // Already signed in: send them home. Someone who's signed in and wants to change their password uses the
  // account settings instead.
  beforeLoad: () => {
    const session = currentSession()
    if (session) throw redirect({ to: homePath(session.role), replace: true })
  },
  component: ResetPasswordPage,
})
