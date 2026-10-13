import { describe, expect, it } from 'vitest'
import { forgotPasswordSchema, type ForgotPasswordFields } from './forgot-password-schema'

const valid: ForgotPasswordFields = { email: 'ira@example.com' }

function errorsFor(fields: ForgotPasswordFields): Record<string, string> {
  const result = forgotPasswordSchema.safeParse(fields)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('forgotPasswordSchema', () => {
  it('accepts a well-formed email', () => {
    expect(errorsFor(valid)).toEqual({})
  })

  it('trims surrounding whitespace from the email', () => {
    const result = forgotPasswordSchema.safeParse({ email: '  Ira@Example.com ' })
    expect(result.success).toBe(true)
    expect(result.data?.email).toBe('Ira@Example.com')
  })

  it('requires an email', () => {
    expect(errorsFor({ email: '   ' })).toEqual({ email: 'Enter your email' })
  })

  it('wants an email address', () => {
    expect(errorsFor({ email: 'not-an-email' })).toEqual({
      email: 'Enter an email address like name@example.com',
    })
  })
})
