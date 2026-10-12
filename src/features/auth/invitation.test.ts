import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { currentSession, loadSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { NO_RESPONSE } from './api'
import {
  acceptFailure,
  acceptInvitation,
  INVITATION_INVALID_MESSAGE,
  invitationLookupQuery,
  roleLabel,
} from './invitation'
import {
  CREATED_NOT_SIGNED_IN_MESSAGE,
  NOT_ALLOWED_MESSAGE,
  NotAllowedError,
  SignedUpNotSignedInError,
  UNREACHABLE_MESSAGE,
} from './session-actions'

const acceptance = { token: 'abc', email: 'new@example.com', firstName: 'Ira', lastName: 'S', password: 'password123' }
const accepted = () =>
  HttpResponse.json({ data: { token: 'raw-auth-token', role_name: 'admin' }, success: true }, { status: 201 })
const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

describe('acceptInvitation', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it("accepts, then signs in with the invitation's email and the new password", async () => {
    const calls: string[] = []
    let login: unknown
    server.use(
      http.post('*/auth/api/invitations/accept', () => {
        calls.push('accept')
        return accepted()
      }),
      http.post('*/auth/api/login', async ({ request }) => {
        calls.push('login')
        login = await request.json()
        return HttpResponse.json({ jwt: makeJwt({ first_name: 'Ira', tenant_id: 9 }), success: true })
      }),
    )
    const session = await acceptInvitation(acceptance)
    expect(calls).toEqual(['accept', 'login'])
    expect(login).toEqual({ email: 'new@example.com', password: 'password123' })
    expect(session).toMatchObject({ firstName: 'Ira', tenantId: 9 })
    expect(currentSession()).toEqual(session)
  })

  it('reports the acceptance as soon as the account exists, even if the sign-in then fails', async () => {
    const events: string[] = []
    server.use(
      http.post('*/auth/api/invitations/accept', () => accepted()),
      http.post('*/auth/api/login', () => {
        events.push('login')
        return HttpResponse.error()
      }),
    )
    await expect(acceptInvitation(acceptance, () => events.push('accepted'))).rejects.toBeInstanceOf(SignedUpNotSignedInError)
    expect(events).toEqual(['accepted', 'login'])
  })

  it('does not report an acceptance the server refused', async () => {
    let reported = false
    server.use(http.post('*/auth/api/invitations/accept', () => envelope(409, 'An account with this email already exists')))
    await expect(acceptInvitation(acceptance, () => (reported = true))).rejects.toBeInstanceOf(ApiError)
    expect(reported).toBe(false)
  })

  it('does not sign in when the acceptance is refused', async () => {
    let loginCalled = false
    server.use(
      http.post('*/auth/api/invitations/accept', () => envelope(404, 'Invitation not found or no longer valid')),
      http.post('*/auth/api/login', () => {
        loginCalled = true
        return HttpResponse.json({})
      }),
    )
    await expect(acceptInvitation(acceptance)).rejects.toEqual(new ApiError(404, 'Invitation not found or no longer valid'))
    expect(loginCalled).toBe(false)
  })

  it('reports a role that cannot use the panel as such, since the account now exists', async () => {
    server.use(
      http.post('*/auth/api/invitations/accept', () => accepted()),
      http.post('*/auth/api/login', () => HttpResponse.json({ jwt: makeJwt({ role_name: 'lead_manager' }), success: true })),
      http.post('*/auth/api/logout', () => HttpResponse.json({ data: { message: 'ok' }, success: true })),
    )
    await expect(acceptInvitation(acceptance)).rejects.toBeInstanceOf(NotAllowedError)
    expect(currentSession()).toBeNull()
  })

  it('says the account exists when it was created but signing in failed', async () => {
    server.use(
      http.post('*/auth/api/invitations/accept', () => accepted()),
      http.post('*/auth/api/login', () => HttpResponse.error()),
    )
    await expect(acceptInvitation(acceptance)).rejects.toBeInstanceOf(SignedUpNotSignedInError)
  })
})

describe('acceptFailure', () => {
  it('treats a 404 as the invitation no longer being valid', () => {
    expect(acceptFailure(new ApiError(404, 'Invitation not found or no longer valid'))).toEqual({
      kind: 'invalid',
      message: INVITATION_INVALID_MESSAGE,
    })
  })

  it('spots a taken email', () => {
    expect(acceptFailure(new ApiError(409, 'An account with this email already exists'))).toEqual({
      kind: 'email-taken',
      message: 'An account with this email already exists',
    })
  })

  it("keeps the server's wording for validation errors", () => {
    expect(acceptFailure(new ApiError(422, 'Password is too short'))).toEqual({ kind: 'other', message: 'Password is too short' })
  })

  it.each([NO_RESPONSE, 500, 502])('explains an outage for status %i', (status) => {
    expect(acceptFailure(new ApiError(status, 'x'))).toEqual({ kind: 'other', message: UNREACHABLE_MESSAGE })
  })

  it('explains the role gate and a failed follow-up sign-in', () => {
    expect(acceptFailure(new NotAllowedError())).toEqual({ kind: 'not-allowed', message: NOT_ALLOWED_MESSAGE })
    expect(acceptFailure(new SignedUpNotSignedInError())).toEqual({
      kind: 'created-not-signed-in',
      message: CREATED_NOT_SIGNED_IN_MESSAGE,
    })
  })
})

describe('invitationLookupQuery', () => {
  it('is keyed by token and leaves retrying to the page', () => {
    const query = invitationLookupQuery('abc')
    expect(query.queryKey).toEqual(['invitation-lookup', 'abc'])
    expect(query.retry).toBe(false)
  })
})

describe('roleLabel', () => {
  it.each([
    ['admin', 'Admin'],
    ['event_manager', 'Event manager'],
    ['lead_manager', 'Lead manager'],
    ['venue_host', 'Venue host'],
    ['', 'Member'],
  ])('labels %j as %j', (role, label) => {
    expect(roleLabel(role)).toBe(label)
  })
})
