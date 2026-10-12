import { z } from 'zod'

// What the browser checks before a signup is sent. The rules mirror auth's User and Tenant validations (presence,
// email format, password length); the server checks them again and anything it adds shows as a form-level message.
export const PASSWORD_MIN_LENGTH = 8

const required = (message: string) => z.string().trim().min(1, message)

export const signupSchema = z
  .object({
    tenantName: required('Enter your organisation’s name'),
    firstName: required('Enter your first name'),
    lastName: required('Enter your last name'),
    email: required('Enter your email').pipe(z.email('Enter an email address like name@example.com')),
    // Not trimmed: the server keeps the password exactly as typed.
    password: z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`),
    confirmPassword: z.string(),
  })
  .refine((fields) => fields.password === fields.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords don’t match',
  })

export type SignupFields = z.infer<typeof signupSchema>
