import { createFileRoute, redirect } from '@tanstack/react-router'
import { LoginPage } from '@/features/auth/login-page'
import { safeRedirect } from '@/features/auth/redirect'
import { currentSession, homePath } from '@/lib/session/session'

export interface LoginSearch {
  // The page to return to after signing in (checked by safeRedirect before use).
  redirect?: string
  // Set when the previous session expired or the server rejected it.
  reason?: 'expired'
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    reason: search.reason === 'expired' ? 'expired' : undefined,
  }),
  // Already signed in: skip the form.
  beforeLoad: ({ search }) => {
    const session = currentSession()
    if (session) throw redirect({ href: safeRedirect(search.redirect) ?? homePath(session.role), replace: true })
  },
  component: LoginPage,
})
