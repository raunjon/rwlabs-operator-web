import { z } from 'zod'
import { passwordField, passwordsMatch } from './form-rules'

export { PASSWORD_MIN_LENGTH } from './form-rules'

// What the browser checks before a reset is sent. The token comes from the URL and is validated by the server;
// the user only picks and confirms the new password.
export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine(...passwordsMatch)

export type ResetPasswordFields = z.infer<typeof resetPasswordSchema>
