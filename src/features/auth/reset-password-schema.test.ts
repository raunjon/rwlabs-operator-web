import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH, resetPasswordSchema, type ResetPasswordFields } from './reset-password-schema'

const valid: ResetPasswordFields = { password: 'password123', confirmPassword: 'password123' }

function errorsFor(fields: ResetPasswordFields): Record<string, string> {
  const result = resetPasswordSchema.safeParse(fields)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('resetPasswordSchema', () => {
  it('accepts a complete form', () => {
    expect(errorsFor(valid)).toEqual({})
  })

  it(`wants a password of at least ${PASSWORD_MIN_LENGTH} characters, matching the server`, () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
    expect(errorsFor({ password: short, confirmPassword: short })).toEqual({
      password: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
    })
  })

  it('asks for the password again when the confirmation differs', () => {
    expect(errorsFor({ ...valid, confirmPassword: 'password124' })).toEqual({
      confirmPassword: 'The passwords don’t match',
    })
  })

  it('reports an empty confirmation as not matching, not as a second length error', () => {
    expect(errorsFor({ ...valid, confirmPassword: '' })).toEqual({ confirmPassword: 'The passwords don’t match' })
  })

  it('does not trim the password: the server keeps it as typed', () => {
    const padded = ' password123'
    const result = resetPasswordSchema.safeParse({ password: padded, confirmPassword: padded })
    expect(result.success).toBe(true)
    expect(result.data?.password).toBe(padded)
  })
})
