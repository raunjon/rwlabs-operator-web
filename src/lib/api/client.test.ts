import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { currentSession, loadSession, sessionEndReason, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { api, requestWithSession } from './client'
import { ApiError, NO_RESPONSE } from './errors'

describe('api client', () => {
  it('sends typed requests to the same origin by default', async () => {
    let requestedUrl = ''
    server.use(
      http.get('*/auth/api/me', ({ request }) => {
        requestedUrl = request.url
        return HttpResponse.json({ data: {}, success: true })
      }),
    )

    const { response } = await api.GET('/auth/api/me')

    expect(response.status).toBe(200)
    expect(requestedUrl).toBe(`${window.location.origin}/auth/api/me`)
  })
})

describe('api client with a session', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('sends the session JWT', async () => {
    const token = makeJwt()
    startSession(token)
    let sent: string | null = null
    server.use(
      http.get('*/auth/api/me', ({ request }) => {
        sent = request.headers.get('X-Jwt-Token')
        return HttpResponse.json({ data: {}, success: true })
      }),
    )
    await api.GET('/auth/api/me')
    expect(sent).toBe(token)
  })

  it('ends the session when the gateway rejects the JWT', async () => {
    startSession(makeJwt())
    server.use(
      http.get('*/auth/api/me', () =>
        HttpResponse.json({ error: { message: 'Session expired, please login again', status: 401 } }, { status: 401 }),
      ),
    )
    await api.GET('/auth/api/me')
    expect(currentSession()).toBeNull()
    expect(sessionEndReason()).toBe('expired')
    expect(sessionStorage.length).toBe(0)
  })

  it('keeps the session on other errors', async () => {
    startSession(makeJwt())
    server.use(http.get('*/auth/api/me', () => HttpResponse.json({}, { status: 403 })))
    await api.GET('/auth/api/me')
    expect(currentSession()).not.toBeNull()
  })

  it('sends no JWT and changes nothing when signed out', async () => {
    let sent: string | null = 'unset'
    server.use(
      http.get('*/auth/api/me', ({ request }) => {
        sent = request.headers.get('X-Jwt-Token')
        return HttpResponse.json({}, { status: 401 })
      }),
    )
    await api.GET('/auth/api/me')
    expect(sent).toBeNull()
    expect(sessionEndReason()).toBeNull()
  })
})

describe('requestWithSession', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('sends the JSON body with the session JWT and resolves to the parsed body', async () => {
    const token = makeJwt()
    startSession(token)
    let seen: { url: string; jwt: string | null; type: string | null; body: unknown } | undefined
    server.use(
      http.post('*/auth/api/invitations', async ({ request }) => {
        seen = {
          url: request.url,
          jwt: request.headers.get('X-Jwt-Token'),
          type: request.headers.get('Content-Type'),
          body: await request.json(),
        }
        return HttpResponse.json({ data: { id: 1 }, success: true })
      }),
    )

    await expect(requestWithSession('POST', '/auth/api/invitations', { email: 'a@b.co' })).resolves.toEqual({
      data: { id: 1 },
      success: true,
    })
    expect(seen).toEqual({
      url: `${window.location.origin}/auth/api/invitations`,
      jwt: token,
      type: 'application/json',
      body: { email: 'a@b.co' },
    })
  })

  it('ends the session on a 401 and rejects with the server message', async () => {
    startSession(makeJwt())
    server.use(
      http.post('*/auth/api/invitations', () =>
        HttpResponse.json({ error: { message: 'Session expired, please login again', status: 401 } }, { status: 401 }),
      ),
    )
    await expect(requestWithSession('POST', '/auth/api/invitations', {})).rejects.toMatchObject({
      status: 401,
      message: 'Session expired, please login again',
    })
    expect(currentSession()).toBeNull()
    expect(sessionEndReason()).toBe('expired')
  })

  it('rejects with the server message and keeps the session on other errors', async () => {
    startSession(makeJwt())
    server.use(
      http.post('*/auth/api/invitations', () =>
        HttpResponse.json({ error: { message: 'Email is invalid', status: 422 }, success: false }, { status: 422 }),
      ),
    )
    const failure = requestWithSession('POST', '/auth/api/invitations', {})
    await expect(failure).rejects.toBeInstanceOf(ApiError)
    await expect(failure).rejects.toMatchObject({ status: 422, message: 'Email is invalid' })
    expect(currentSession()).not.toBeNull()
  })

  it('never shows a proxy HTML error page', async () => {
    startSession(makeJwt())
    server.use(
      http.post('*/auth/api/invitations', () => HttpResponse.html('<html><h1>502 Bad Gateway</h1></html>', { status: 502 })),
    )
    await expect(requestWithSession('POST', '/auth/api/invitations', {})).rejects.toMatchObject({
      status: 502,
      message: 'Request failed (502)',
    })
  })

  it('rejects with NO_RESPONSE when the network fails', async () => {
    startSession(makeJwt())
    server.use(http.post('*/auth/api/invitations', () => HttpResponse.error()))
    await expect(requestWithSession('POST', '/auth/api/invitations', {})).rejects.toMatchObject({ status: NO_RESPONSE })
  })

  it('rejects with NO_RESPONSE when the answer never arrives', async () => {
    startSession(makeJwt())
    server.use(
      http.post('*/auth/api/invitations', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await expect(requestWithSession('POST', '/auth/api/invitations', {}, 50)).rejects.toMatchObject({
      status: NO_RESPONSE,
    })
  })
})
