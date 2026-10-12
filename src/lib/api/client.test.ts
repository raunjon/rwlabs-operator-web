import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { currentSession, loadSession, sessionEndReason, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { api } from './client'

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
