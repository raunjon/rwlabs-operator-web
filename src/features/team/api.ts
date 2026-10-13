import { requestWithSession } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import type { paths } from '@/lib/api/schema'
import { parseTimestamp } from '@/lib/session/jwt'

// What the create route answers with: the gateway's CreatedInvitation, the only schema that carries accept_token
// (Invitation, used by index/resend/destroy, deliberately doesn't). Typed from the route rather than the schema
// name, so the key names below are checked against whatever this route returns: a rename fails the typecheck.
type GatewayInvitation =
  paths['/auth/api/invitations']['post']['responses'][200]['content']['application/json']['data']

const EMAIL: keyof GatewayInvitation = 'email'
const ROLE: keyof GatewayInvitation = 'role'
const EXPIRES_AT: keyof GatewayInvitation = 'expires_at'
const ACCEPT_TOKEN: keyof GatewayInvitation = 'accept_token'

export interface NewInvitation {
  email: string
  role: string
}

export interface CreatedInvitation {
  email: string
  role: string
  // Milliseconds since the epoch, or null when the server doesn't say.
  expiresAt: number | null
  // The raw token for the accept link. Only create's response carries it (AUTH-6, GAT-5); null when a gateway
  // without GAT-5 drops it, in which case the invitation still exists and the invitee gets the email.
  acceptToken: string | null
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

// POST /auth/api/invitations: invites someone to the signed-in admin's organisation. The gateway's OpenAPI file
// doesn't describe the request body, hence requestWithSession rather than the typed client. Rejects with the
// server's message: 409 when the email already has an account or a pending invitation, 422 for an invalid email
// or role (one joined message), 403 for a user who isn't an admin.
export async function requestCreateInvitation(invitation: NewInvitation): Promise<CreatedInvitation> {
  const body = await requestWithSession('POST', '/auth/api/invitations', {
    email: invitation.email,
    role: invitation.role,
  })
  const data =
    typeof body === 'object' && body !== null && 'data' in body && typeof body.data === 'object' && body.data !== null
      ? (body.data as Record<string, unknown>)
      : null
  if (!data || !text(data[EMAIL])) throw new ApiError(200, 'The server sent an unexpected response')
  return {
    email: text(data[EMAIL]),
    role: text(data[ROLE]),
    expiresAt: parseTimestamp(data[EXPIRES_AT]),
    acceptToken: text(data[ACCEPT_TOKEN]) || null,
  }
}
