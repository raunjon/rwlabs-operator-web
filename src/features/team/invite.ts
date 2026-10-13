import { useMutation } from '@tanstack/react-query'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import { requestCreateInvitation, type NewInvitation } from './api'

// The roles an admin may invite with: auth's User::OPERATOR_ROLES. Only admin can use this panel today; the others
// get "can't use the operator panel yet" after accepting.
export const INVITE_ROLES = ['admin', 'event_manager', 'lead_manager'] as const

export const NO_ACCESS_MESSAGE = 'You don’t have access to this.'

// The link the invitee opens: the accept page (OW-5) on this panel's own origin, so it is right on every
// environment without configuration. The path and ?token= are the ones auth's invitation email uses.
export function acceptLink(token: string, origin: string = window.location.origin): string {
  return `${origin}/invitations/accept?${new URLSearchParams({ token })}`
}

// What the invite card shows for a failed invite. 409 (an account or a pending invitation already has the
// email) and 422 (one joined validation message) carry the server's own words.
export function inviteFailure(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.'
  if (error.status === 403) return NO_ACCESS_MESSAGE
  if (error.status === NO_RESPONSE || error.status >= 500) return UNREACHABLE_MESSAGE
  return error.message
}

// No query lists invitations yet, so there is nothing to invalidate; the invitations list ticket adds that here.
export function useCreateInvitation() {
  return useMutation({ mutationFn: (invitation: NewInvitation) => requestCreateInvitation(invitation) })
}
