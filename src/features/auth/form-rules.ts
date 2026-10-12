import { z } from 'zod'

// Rules shared by the account forms (signup, accepting an invitation). They mirror auth's User validations: the
// server checks them again, and anything it adds shows as a form-level message.
export const PASSWORD_MIN_LENGTH = 8

export const required = (message: string) => z.string().trim().min(1, message)

// Not trimmed: the server keeps the password exactly as typed.
export const passwordField = z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)

// The arguments for .refine on an object with password and confirmPassword fields: spread them in.
type PasswordPair = { password: string; confirmPassword: string }
export const passwordsMatch: [(fields: PasswordPair) => boolean, { path: string[]; message: string }] = [
  (fields) => fields.password === fields.confirmPassword,
  { path: ['confirmPassword'], message: 'The passwords don’t match' },
]
