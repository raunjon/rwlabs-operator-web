import { describe, expect, it } from 'vitest'
import { PASSWORD_MIN_LENGTH, signupSchema, type SignupFields } from './signup-schema'

const valid: SignupFields = {
  tenantName: 'Acme Events',
  firstName: 'Ira',
  lastName: 'S',
  email: 'ira@example.com',
  password: 'password123',
  confirmPassword: 'password123',
}

// { fieldName: message } for a rejected form, or {} when it passes.
function errorsFor(fields: SignupFields): Record<string, string> {
  const result = signupSchema.safeParse(fields)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('signupSchema', () => {
  it('accepts a complete form', () => {
    expect(errorsFor(valid)).toEqual({})
  })

  it('trims the organisation name, names and email, but not the password', () => {
    const result = signupSchema.safeParse({
      ...valid,
      tenantName: '  Acme Events ',
      firstName: ' Ira',
      lastName: 'S ',
      email: ' Ira@Example.com ',
      password: ' password123',
      confirmPassword: ' password123',
    })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      tenantName: 'Acme Events',
      firstName: 'Ira',
      lastName: 'S',
      email: 'Ira@Example.com',
      password: ' password123',
    })
  })

  it.each([
    ['tenantName', 'Enter your organisation’s name'],
    ['firstName', 'Enter your first name'],
    ['lastName', 'Enter your last name'],
    ['email', 'Enter your email'],
  ] as const)('requires %s', (field, message) => {
    expect(errorsFor({ ...valid, [field]: '   ' })).toEqual({ [field]: message })
  })

  it('wants an email address', () => {
    expect(errorsFor({ ...valid, email: 'not-an-email' })).toEqual({
      email: 'Enter an email address like name@example.com',
    })
  })

  it(`wants a password of at least ${PASSWORD_MIN_LENGTH} characters, matching the server`, () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)
    expect(errorsFor({ ...valid, password: short, confirmPassword: short })).toEqual({
      password: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
    })
    const enough = 'a'.repeat(PASSWORD_MIN_LENGTH)
    expect(errorsFor({ ...valid, password: enough, confirmPassword: enough })).toEqual({})
  })

  it('asks for the password again when the confirmation differs', () => {
    expect(errorsFor({ ...valid, confirmPassword: 'password124' })).toEqual({
      confirmPassword: 'The passwords don’t match',
    })
  })

  it('reports an empty confirmation as not matching, not as a second length error', () => {
    expect(errorsFor({ ...valid, confirmPassword: '' })).toEqual({ confirmPassword: 'The passwords don’t match' })
  })

  it('reports every failing field at once', () => {
    expect(Object.keys(errorsFor({ ...valid, tenantName: '', email: 'x', password: 'short', confirmPassword: '' })).sort()).toEqual(
      ['confirmPassword', 'email', 'password', 'tenantName'],
    )
  })
})
