import { z } from 'zod'
import { required } from '@/features/auth/form-rules'
import { INVITE_ROLES } from './invite'

// Mirrors auth's Invitation validations (email format, role in User::OPERATOR_ROLES). Whether the email already
// has an account or a pending invitation only the server knows: it answers 409.
export const inviteSchema = z.object({
  email: required('Enter their email').pipe(z.email('Enter a valid email address')),
  role: z.enum(INVITE_ROLES, 'Choose a role'),
})

export type InviteFields = z.infer<typeof inviteSchema>
