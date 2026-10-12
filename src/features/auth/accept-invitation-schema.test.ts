import { describe, expect, it } from 'vitest'
import { acceptInvitationSchema, type AcceptInvitationFields } from './accept-invitation-schema'
import { PASSWORD_MIN_LENGTH } from './form-rules'

const valid: AcceptInvitationFields = {
  firstName: 'Ira',
  lastName: 'S',
  password: 'password123',
  confirmPassword: 'password123',
}

function errorsFor(fields: AcceptInvitationFields): Record<string, string> {
  const result = acceptInvitationSchema.safeParse(fields)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('acceptInvitationSchema', () => {
  it('accepts a complete form, trimming the names but not the password', () => {
    const result = acceptInvitationSchema.safeParse({ ...valid, firstName: ' Ira ', password: ' password123', confirmPassword: ' password123' })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ firstName: 'Ira', lastName: 'S', password: ' password123', confirmPassword: ' password123' })
  })

  it.each([
    ['firstName', 'Enter your first name'],
    ['lastName', 'Enter your last name'],
  ] as const)('requires %s', (field, message) => {
    expect(errorsFor({ ...valid, [field]: '   ' })).toEqual({ [field]: message })
  })

  it('shares the password rules with signup', () => {
    const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
    expect(errorsFor({ ...valid, password: short, confirmPassword: short })).toEqual({
      password: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
    })
    expect(errorsFor({ ...valid, confirmPassword: 'password124' })).toEqual({
      confirmPassword: 'The passwords don’t match',
    })
  })
})
