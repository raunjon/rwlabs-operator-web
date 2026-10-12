import { createFileRoute } from '@tanstack/react-router'
import { AcceptInvitationPage } from '@/features/auth/accept-invitation-page'

export interface AcceptInvitationSearch {
  // The raw invitation token from the email link; missing or empty means the link is unusable.
  token?: string
}

// Public, and reachable while signed in: the page itself asks a signed-in user to sign out first. The path is
// what auth's invitation email links to, so it must not change.
export const Route = createFileRoute('/invitations/accept')({
  validateSearch: (search: Record<string, unknown>): AcceptInvitationSearch => ({
    token: typeof search.token === 'string' && search.token ? search.token : undefined,
  }),
  component: AcceptInvitationPage,
})
