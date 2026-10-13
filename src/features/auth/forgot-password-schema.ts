import { z } from 'zod'
import { required } from './form-rules'

// What the browser checks before a reset request is sent. The server accepts any string, but giving the browser
// a reason to point at a bad field keeps the page honest; invalid emails never reach the gateway.
export const forgotPasswordSchema = z.object({
  email: required('Enter your email').pipe(z.email('Enter an email address like name@example.com')),
})

export type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>
