import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { server } from '@/test/msw'
import {
  NO_RESPONSE,
  requestAcceptInvitation,
  requestForgotPassword,
  requestInvitationLookup,
  requestResetPassword,
  requestSignIn,
  requestSignOut,
  requestSignUp,
} from './api'

describe('requestSignIn', () => {
  it('posts the credentials with the device headers and returns the JWT', async () => {
    let seen: { url: string; headers: Headers; body: unknown } | undefined
    server.use(
      http.post('*/auth/api/login', async ({ request }) => {
        seen = { url: request.url, headers: request.headers, body: await request.json() }
        return HttpResponse.json({ jwt: 'the.jwt.value', success: true })
      }),
    )

    await expect(requestSignIn('asha@example.com', 'secret')).resolves.toBe('the.jwt.value')
    expect(new URL(seen!.url).search).toBe('?jwt=true')
    expect(seen!.body).toEqual({ email: 'asha@example.com', password: 'secret' })
    expect(seen!.headers.get('X-Platform')).toBe('web')
    for (const header of ['X-Device-Identifier', 'X-App-Version', 'X-OS-Version', 'X-Api-Version']) {
      expect(seen!.headers.get(header), header).toBeTruthy()
    }
    expect(seen!.headers.get('X-Jwt-Token')).toBeNull()
  })

  it.each([
    [401, 'Invalid Email or Password'],
    [403, 'This organisation has been suspended'],
    [400, 'Email required'],
  ])('rejects a %i with the server message', async (status, message) => {
    server.use(
      http.post('*/auth/api/login', () =>
        HttpResponse.json({ error: { message, status }, success: false }, { status }),
      ),
    )
    await expect(requestSignIn('a@b.c', 'x')).rejects.toEqual(new ApiError(status, message))
  })

  it('rejects a proxy HTML error page without showing it', async () => {
    server.use(http.post('*/auth/api/login', () => HttpResponse.html('<html>502 Bad Gateway</html>', { status: 502 })))
    const error = await requestSignIn('a@b.c', 'x').catch((caught: unknown) => caught)
    expect(error).toMatchObject({ status: 502 })
    expect((error as ApiError).message).not.toContain('<html>')
  })

  it('rejects a success without a JWT', async () => {
    server.use(http.post('*/auth/api/login', () => HttpResponse.json({ data: { token: 'x' }, success: true })))
    await expect(requestSignIn('a@b.c', 'x')).rejects.toMatchObject({ status: 200 })
  })

  it('rejects with no status on a network error', async () => {
    server.use(http.post('*/auth/api/login', () => HttpResponse.error()))
    await expect(requestSignIn('a@b.c', 'x')).rejects.toMatchObject({ status: NO_RESPONSE })
  })

  it('gives up when the gateway never answers', async () => {
    server.use(
      http.post('*/auth/api/login', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await expect(requestSignIn('a@b.c', 'x', 50)).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})

describe('requestSignOut', () => {
  it('sends the session token', async () => {
    let token: string | null = null
    server.use(
      http.post('*/auth/api/logout', ({ request }) => {
        token = request.headers.get('X-Jwt-Token')
        return HttpResponse.json({ data: { message: 'Logged out successfully' }, success: true })
      }),
    )
    await requestSignOut('the.jwt.value')
    expect(token).toBe('the.jwt.value')
  })

  it.each([
    ['a network error', () => HttpResponse.error()],
    ['a 500', () => HttpResponse.json({}, { status: 500 })],
    [
      'no answer',
      async () => {
        await delay('infinite')
        return HttpResponse.json({})
      },
    ],
  ])('never rejects, even on %s', async (_label, resolver) => {
    server.use(http.post('*/auth/api/logout', resolver))
    await expect(requestSignOut('the.jwt.value', 50)).resolves.toBeUndefined()
  })
})

describe('requestSignUp', () => {
  const account = {
    tenantName: 'Acme Events',
    firstName: 'Ira',
    lastName: 'S',
    email: 'ira@example.com',
    password: 'password123',
  }
  const created = () =>
    HttpResponse.json({ data: { token: 'raw-auth-token', role_name: 'admin' }, success: true }, { status: 201 })

  it("posts the account in the server's field names, with the device headers", async () => {
    let seen: { url: string; headers: Headers; body: unknown } | undefined
    server.use(
      http.post('*/auth/api/operators/signup', async ({ request }) => {
        seen = { url: request.url, headers: request.headers, body: await request.json() }
        return created()
      }),
    )

    await expect(requestSignUp(account)).resolves.toBeUndefined()
    expect(new URL(seen!.url).pathname).toBe('/auth/api/operators/signup')
    expect(seen!.body).toEqual({
      tenant_name: 'Acme Events',
      first_name: 'Ira',
      last_name: 'S',
      email: 'ira@example.com',
      password: 'password123',
    })
    expect(seen!.headers.get('X-Platform')).toBe('web')
    for (const header of ['X-Device-Identifier', 'X-App-Version', 'X-OS-Version', 'X-Api-Version']) {
      expect(seen!.headers.get(header), header).toBeTruthy()
    }
    expect(seen!.headers.get('X-Jwt-Token')).toBeNull()
  })

  it.each([
    [409, 'An account with this email already exists'],
    [409, 'Another signup is using this organisation name right now, please try again'],
    [422, "Tenant name can't be blank, Password is too short (minimum is 8 characters)"],
    [400, 'Device identifier required'],
  ])('rejects a %i with the server message', async (status, message) => {
    server.use(
      http.post('*/auth/api/operators/signup', () =>
        HttpResponse.json({ error: { message, status }, success: false }, { status }),
      ),
    )
    await expect(requestSignUp(account)).rejects.toEqual(new ApiError(status, message))
  })

  it('rejects a proxy HTML error page without showing it', async () => {
    server.use(
      http.post('*/auth/api/operators/signup', () => HttpResponse.html('<html>502 Bad Gateway</html>', { status: 502 })),
    )
    const error = await requestSignUp(account).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ status: 502 })
    expect((error as ApiError).message).not.toContain('<html>')
  })

  it('rejects with no status on a network error', async () => {
    server.use(http.post('*/auth/api/operators/signup', () => HttpResponse.error()))
    await expect(requestSignUp(account)).rejects.toMatchObject({ status: NO_RESPONSE })
  })

  it('gives up when the gateway never answers', async () => {
    server.use(
      http.post('*/auth/api/operators/signup', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await expect(requestSignUp(account, 50)).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})

describe('requestInvitationLookup', () => {
  it('asks for the invite by token, without device headers or a session token, and reads it', async () => {
    let seen: { url: string; headers: Headers } | undefined
    server.use(
      http.get('*/auth/api/invitations/lookup', ({ request }) => {
        seen = { url: request.url, headers: request.headers }
        return HttpResponse.json({
          data: { email: 'new@example.com', role: 'lead_manager', tenant_name: 'Acme Events', expires_at: 1_900_000_000 },
          success: true,
        })
      }),
    )

    await expect(requestInvitationLookup('abc+/=')).resolves.toEqual({
      email: 'new@example.com',
      role: 'lead_manager',
      tenantName: 'Acme Events',
      expiresAt: 1_900_000_000_000,
    })
    const url = new URL(seen!.url)
    expect(url.pathname).toBe('/auth/api/invitations/lookup')
    expect(url.searchParams.get('token')).toBe('abc+/=')
    expect(seen!.headers.get('X-Jwt-Token')).toBeNull()
  })

  it('copes with an ISO expiry and a missing one', async () => {
    server.use(
      http.get('*/auth/api/invitations/lookup', () =>
        HttpResponse.json({ data: { email: 'n@example.com', role: 'admin', tenant_name: 'Acme', expires_at: '2030-03-17T17:46:40.000Z' } }),
      ),
    )
    await expect(requestInvitationLookup('t')).resolves.toMatchObject({ expiresAt: 1_900_000_000_000 })
    server.use(
      http.get('*/auth/api/invitations/lookup', () =>
        HttpResponse.json({ data: { email: 'n@example.com', role: 'admin', tenant_name: 'Acme' } }),
      ),
    )
    await expect(requestInvitationLookup('t')).resolves.toMatchObject({ expiresAt: null })
  })

  it('rejects a 404 with the server message', async () => {
    server.use(
      http.get('*/auth/api/invitations/lookup', () =>
        HttpResponse.json({ error: { message: 'Invitation not found or no longer valid', status: 404 }, success: false }, { status: 404 }),
      ),
    )
    await expect(requestInvitationLookup('stale')).rejects.toEqual(new ApiError(404, 'Invitation not found or no longer valid'))
  })

  it('rejects a success without an email', async () => {
    server.use(http.get('*/auth/api/invitations/lookup', () => HttpResponse.json({ data: { role: 'admin' }, success: true })))
    await expect(requestInvitationLookup('t')).rejects.toMatchObject({ status: 200 })
  })

  it('rejects with no status on a network error', async () => {
    server.use(http.get('*/auth/api/invitations/lookup', () => HttpResponse.error()))
    await expect(requestInvitationLookup('t')).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})

describe('requestAcceptInvitation', () => {
  const acceptance = { token: 'abc', firstName: 'Ira', lastName: 'S', password: 'password123' }

  it("posts the token and details in the server's field names, with the device headers", async () => {
    let seen: { headers: Headers; body: unknown } | undefined
    server.use(
      http.post('*/auth/api/invitations/accept', async ({ request }) => {
        seen = { headers: request.headers, body: await request.json() }
        return HttpResponse.json({ data: { token: 'raw-auth-token', role_name: 'admin' }, success: true }, { status: 201 })
      }),
    )
    await expect(requestAcceptInvitation(acceptance)).resolves.toBeUndefined()
    expect(seen!.body).toEqual({ token: 'abc', first_name: 'Ira', last_name: 'S', password: 'password123' })
    expect(seen!.headers.get('X-Platform')).toBe('web')
    expect(seen!.headers.get('X-Device-Identifier')).toBeTruthy()
    expect(seen!.headers.get('X-Jwt-Token')).toBeNull()
  })

  it.each([
    [404, 'Invitation not found or no longer valid'],
    [409, 'An account with this email already exists'],
    [422, 'Password is too short (minimum is 8 characters)'],
  ])('rejects a %i with the server message', async (status, message) => {
    server.use(
      http.post('*/auth/api/invitations/accept', () =>
        HttpResponse.json({ error: { message, status }, success: false }, { status }),
      ),
    )
    await expect(requestAcceptInvitation(acceptance)).rejects.toEqual(new ApiError(status, message))
  })
})

describe('requestForgotPassword', () => {
  it('posts the email without device headers or a session token', async () => {
    let seen: { url: string; headers: Headers; body: unknown } | undefined
    server.use(
      http.post('*/auth/api/password/forgot', async ({ request }) => {
        seen = { url: request.url, headers: request.headers, body: await request.json() }
        return HttpResponse.json({ data: { message: 'ok' }, success: true })
      }),
    )

    await expect(requestForgotPassword('ira@example.com')).resolves.toBeUndefined()
    expect(new URL(seen!.url).pathname).toBe('/auth/api/password/forgot')
    expect(seen!.body).toEqual({ email: 'ira@example.com' })
    expect(seen!.headers.get('X-Jwt-Token')).toBeNull()
    expect(seen!.headers.get('X-Device-Identifier')).toBeNull()
  })

  it('rejects with no status on a network error', async () => {
    server.use(http.post('*/auth/api/password/forgot', () => HttpResponse.error()))
    await expect(requestForgotPassword('a@b.c')).rejects.toMatchObject({ status: NO_RESPONSE })
  })

  it('rejects a server error with its message', async () => {
    server.use(
      http.post('*/auth/api/password/forgot', () =>
        HttpResponse.json({ error: { message: 'Email required', status: 400 }, success: false }, { status: 400 }),
      ),
    )
    await expect(requestForgotPassword('')).rejects.toEqual(new ApiError(400, 'Email required'))
  })

  it('gives up when the gateway never answers', async () => {
    server.use(
      http.post('*/auth/api/password/forgot', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await expect(requestForgotPassword('a@b.c', 50)).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})

describe('requestResetPassword', () => {
  const reset = { token: 'abc', password: 'password123' }

  it('posts the token and new password without device headers or a session token', async () => {
    let seen: { url: string; headers: Headers; body: unknown } | undefined
    server.use(
      http.post('*/auth/api/password/reset', async ({ request }) => {
        seen = { url: request.url, headers: request.headers, body: await request.json() }
        return HttpResponse.json({ data: { message: 'Password updated' }, success: true })
      }),
    )

    await expect(requestResetPassword(reset)).resolves.toBeUndefined()
    expect(new URL(seen!.url).pathname).toBe('/auth/api/password/reset')
    expect(seen!.body).toEqual({ token: 'abc', password: 'password123' })
    expect(seen!.headers.get('X-Jwt-Token')).toBeNull()
    expect(seen!.headers.get('X-Device-Identifier')).toBeNull()
  })

  it.each([
    [404, 'Reset link is invalid or has expired'],
    [422, 'Password is too short (minimum is 8 characters)'],
  ])('rejects a %i with the server message', async (status, message) => {
    server.use(
      http.post('*/auth/api/password/reset', () =>
        HttpResponse.json({ error: { message, status }, success: false }, { status }),
      ),
    )
    await expect(requestResetPassword(reset)).rejects.toEqual(new ApiError(status, message))
  })

  it('rejects with no status on a network error', async () => {
    server.use(http.post('*/auth/api/password/reset', () => HttpResponse.error()))
    await expect(requestResetPassword(reset)).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})
