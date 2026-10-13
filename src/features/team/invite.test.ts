import { describe, expect, it } from 'vitest'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { acceptLink, INVITE_ROLES, inviteFailure, NO_ACCESS_MESSAGE } from './invite'
import { inviteSchema } from './invite-schema'

describe('acceptLink', () => {
  it('points at the accept page on the origin it is given', () => {
    expect(acceptLink('abc', 'https://console.example.com')).toBe('https://console.example.com/invitations/accept?token=abc')
    expect(acceptLink('abc', 'http://localhost:3020')).toBe('http://localhost:3020/invitations/accept?token=abc')
  })

  it('uses the page’s own origin by default', () => {
    expect(acceptLink('abc')).toBe(`${window.location.origin}/invitations/accept?token=abc`)
  })

  it('encodes the token', () => {
    expect(acceptLink('a+b/c=', 'https://x.test')).toBe('https://x.test/invitations/accept?token=a%2Bb%2Fc%3D')
  })
})

describe('inviteSchema', () => {
  const parse = (fields: Record<string, string>) => inviteSchema.safeParse({ email: 'a@b.co', role: 'admin', ...fields })
  const messages = (fields: Record<string, string>) => {
    const result = parse(fields)
    return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]))
  }

  it('accepts an email and each role the server allows', () => {
    expect(INVITE_ROLES).toEqual(['admin', 'event_manager', 'lead_manager'])
    for (const role of INVITE_ROLES) expect(parse({ role }).success).toBe(true)
  })

  it('trims the email', () => {
    expect(parse({ email: '  a@b.co ' })).toMatchObject({ data: { email: 'a@b.co' } })
  })

  it('asks for an email, then a valid one', () => {
    expect(messages({ email: ' ' })).toEqual({ email: 'Enter their email' })
    expect(messages({ email: 'not-an-email' })).toEqual({ email: 'Enter a valid email address' })
  })

  it('rejects a role the server doesn’t allow', () => {
    expect(messages({ role: 'super_admin' })).toEqual({ role: 'Choose a role' })
  })
})

describe('inviteFailure', () => {
  it.each([
    [409, 'Email already belongs to an account'],
    [409, 'Email already has a pending invitation'],
    [422, 'Email is invalid and Role is not included in the list'],
  ])('shows the server’s message for a %i', (status, message) => {
    expect(inviteFailure(new ApiError(status, message))).toBe(message)
  })

  it('says the user has no access on a 403', () => {
    expect(inviteFailure(new ApiError(403, 'Forbidden'))).toBe(NO_ACCESS_MESSAGE)
  })

  it.each([NO_RESPONSE, 500, 502, 504])('says the server is unreachable for status %i', (status) => {
    expect(inviteFailure(new ApiError(status, 'Request failed'))).toBe(UNREACHABLE_MESSAGE)
  })

  it('falls back to a generic message for anything else', () => {
    expect(inviteFailure(new Error('boom'))).toBe('Something went wrong. Try again.')
  })
})
