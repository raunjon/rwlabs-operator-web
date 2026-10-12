import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { server } from '@/test/msw'
import { NO_RESPONSE, requestSignIn, requestSignOut, requestSignUp } from './api'

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
