import { z } from 'zod'
import { passwordField, passwordsMatch, required } from './form-rules'

export { PASSWORD_MIN_LENGTH } from './form-rules'

// What the browser checks before a signup is sent. The rules mirror auth's User and Tenant validations (presence,
// email format, password length); the server checks them again and anything it adds shows as a form-level message.
export const signupSchema = z
  .object({
    tenantName: required('Enter your organisation’s name'),
    firstName: required('Enter your first name'),
    lastName: required('Enter your last name'),
    email: required('Enter your email').pipe(z.email('Enter an email address like name@example.com')),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine(...passwordsMatch)

export type SignupFields = z.infer<typeof signupSchema>
