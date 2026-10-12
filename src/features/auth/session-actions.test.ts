import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { currentSession, loadSession } from '@/lib/session/session'
import { SESSION_STORAGE_KEY } from '@/lib/session/storage'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { NO_RESPONSE } from './api'
import {
  CREATED_NOT_SIGNED_IN_MESSAGE,
  NotAllowedError,
  SignedUpNotSignedInError,
  signUp,
  signUpFailure,
  UNREACHABLE_MESSAGE,
} from './session-actions'

const account = {
  tenantName: 'Acme Events',
  firstName: 'Ira',
  lastName: 'S',
  email: 'ira@example.com',
  password: 'password123',
}

const signupCreated = () =>
  HttpResponse.json({ data: { token: 'raw-auth-token', role_name: 'admin' }, success: true }, { status: 201 })

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

describe('signUp', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('creates the account, then signs in with the same email and password', async () => {
    const calls: string[] = []
    let login: unknown
    const jwt = makeJwt({ first_name: 'Ira', tenant_id: 9 })
    server.use(
      http.post('*/auth/api/operators/signup', () => {
        calls.push('signup')
        return signupCreated()
      }),
      http.post('*/auth/api/login', async ({ request }) => {
        calls.push('login')
        login = await request.json()
        return HttpResponse.json({ jwt, success: true })
      }),
    )

    const session = await signUp(account)

    expect(calls).toEqual(['signup', 'login'])
    expect(login).toEqual({ email: 'ira@example.com', password: 'password123' })
    expect(session).toMatchObject({ firstName: 'Ira', role: 'admin', tenantId: 9 })
    expect(currentSession()).toEqual(session)
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(jwt)
  })

  it('does not try to sign in when the signup is refused', async () => {
    let loginCalled = false
    server.use(
      http.post('*/auth/api/operators/signup', () => envelope(409, 'An account with this email already exists')),
      http.post('*/auth/api/login', () => {
        loginCalled = true
        return HttpResponse.json({})
      }),
    )
    await expect(signUp(account)).rejects.toEqual(new ApiError(409, 'An account with this email already exists'))
    expect(loginCalled).toBe(false)
    expect(currentSession()).toBeNull()
  })

  it('says the account exists when it was created but signing in failed', async () => {
    server.use(
      http.post('*/auth/api/operators/signup', () => signupCreated()),
      http.post('*/auth/api/login', () => HttpResponse.error()),
    )
    await expect(signUp(account)).rejects.toBeInstanceOf(SignedUpNotSignedInError)
    expect(currentSession()).toBeNull()
  })
})

describe('signUpFailure', () => {
  it('spots a taken email', () => {
    expect(signUpFailure(new ApiError(409, 'An account with this email already exists'))).toEqual({
      kind: 'email-taken',
      message: 'An account with this email already exists',
    })
  })

  it('treats any other conflict as the organisation name being in use', () => {
    const message = 'Another signup is using this organisation name right now, please try again'
    expect(signUpFailure(new ApiError(409, message))).toEqual({ kind: 'name-in-use', message })
  })

  it("keeps the server's wording for validation and bad requests", () => {
    expect(signUpFailure(new ApiError(422, "Tenant name can't be blank"))).toEqual({
      kind: 'other',
      message: "Tenant name can't be blank",
    })
    expect(signUpFailure(new ApiError(400, 'Device identifier required'))).toEqual({
      kind: 'other',
      message: 'Device identifier required',
    })
  })

  it.each([NO_RESPONSE, 500, 502, 503])('explains an outage for status %i', (status) => {
    expect(signUpFailure(new ApiError(status, 'whatever'))).toEqual({ kind: 'other', message: UNREACHABLE_MESSAGE })
  })

  it('tells the user to sign in when the account exists but the sign-in failed', () => {
    expect(signUpFailure(new SignedUpNotSignedInError())).toEqual({
      kind: 'created-not-signed-in',
      message: CREATED_NOT_SIGNED_IN_MESSAGE,
    })
  })

  it('passes on the role gate message', () => {
    expect(signUpFailure(new NotAllowedError())).toEqual({ kind: 'other', message: new NotAllowedError().message })
  })

  it('has a generic message for anything unexpected', () => {
    expect(signUpFailure(new TypeError('boom'))).toEqual({ kind: 'other', message: 'Something went wrong. Try again.' })
  })
})
