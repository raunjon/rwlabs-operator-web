import { z } from 'zod'
import { passwordField, passwordsMatch, required } from './form-rules'

// What the invitee fills in: the email and role come from the invitation itself.
export const acceptInvitationSchema = z
  .object({
    firstName: required('Enter your first name'),
    lastName: required('Enter your last name'),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine(...passwordsMatch)

export type AcceptInvitationFields = z.infer<typeof acceptInvitationSchema>
