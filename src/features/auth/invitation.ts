import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/errors'
import type { PanelSession } from '@/lib/session/session'
import { NO_RESPONSE, requestAcceptInvitation, requestInvitationLookup, type InvitationAcceptance } from './api'
import {
  CREATED_NOT_SIGNED_IN_MESSAGE,
  NOT_ALLOWED_MESSAGE,
  NotAllowedError,
  SignedUpNotSignedInError,
  signIn,
  UNREACHABLE_MESSAGE,
} from './session-actions'

export const INVITATION_INVALID_MESSAGE = 'This invitation is no longer valid, ask your admin to resend it.'

// The invite behind a link. Not retried on its own: a 404 is the link's final state (used, revoked, expired or
// unknown), and for an outage the page offers a "Try again" button.
export function invitationLookupQuery(token: string) {
  return queryOptions({
    queryKey: ['invitation-lookup', token],
    queryFn: () => requestInvitationLookup(token),
    retry: false,
    staleTime: Infinity,
  })
}

// Creates the invitee's account, then signs it in with the invitation's email and the new password (accept
// returns no gateway JWT, see requestAcceptInvitation). onAccepted runs as soon as the account exists, whatever
// the sign-in then does: from that point the invitation is used up. A role the panel doesn't support yet is
// reported as such: the account exists, the invitee just can't use this panel with it (OW-3's role gate).
export async function acceptInvitation(
  acceptance: InvitationAcceptance & { email: string },
  onAccepted: () => void = () => {},
): Promise<PanelSession> {
  await requestAcceptInvitation(acceptance)
  onAccepted()
  try {
    return await signIn(acceptance.email, acceptance.password)
  } catch (error) {
    if (error instanceof NotAllowedError) throw error
    throw new SignedUpNotSignedInError()
  }
}

export type AcceptFailure = {
  kind: 'invalid' | 'email-taken' | 'not-allowed' | 'created-not-signed-in' | 'other'
  message: string
}

// What the accept form shows for a failed acceptance.
export function acceptFailure(error: unknown): AcceptFailure {
  if (error instanceof NotAllowedError) return { kind: 'not-allowed', message: NOT_ALLOWED_MESSAGE }
  if (error instanceof SignedUpNotSignedInError) {
    return { kind: 'created-not-signed-in', message: CREATED_NOT_SIGNED_IN_MESSAGE }
  }
  if (!(error instanceof ApiError)) return { kind: 'other', message: 'Something went wrong. Try again.' }
  if (error.status === 404) return { kind: 'invalid', message: INVITATION_INVALID_MESSAGE }
  if (error.status === 409) return { kind: 'email-taken', message: error.message }
  if (error.status === NO_RESPONSE || error.status >= 500) return { kind: 'other', message: UNREACHABLE_MESSAGE }
  return { kind: 'other', message: error.message }
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  event_manager: 'Event manager',
  lead_manager: 'Lead manager',
}

// How a role key reads on screen. Unknown keys are humanised rather than shown raw.
export function roleLabel(role: string): string {
  if (!role) return 'Member'
  const known = ROLE_LABELS[role]
  if (known) return known
  const words = role.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Once accepted, the cached lookup no longer describes a usable invitation: it is marked stale (not refetched,
// so the page can still explain a failed follow-up sign-in) and any later visit, Back included, asks the server
// again and gets the invalid state.
export function useAcceptInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (acceptance: InvitationAcceptance & { email: string }) =>
      acceptInvitation(acceptance, () =>
        queryClient.invalidateQueries({ queryKey: invitationLookupQuery(acceptance.token).queryKey, refetchType: 'none' }),
      ),
  })
}
