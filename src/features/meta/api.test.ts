import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import { loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import {
  fetchMetaConnection,
  fetchMetaPages,
  requestConnectToMeta,
  requestCreateMetaPage,
  requestUpdateMetaPage,
} from './api'

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

beforeEach(() => {
  sessionStorage.clear()
  loadSession()
  startSession(makeJwt())
})

describe('fetchMetaConnection', () => {
  it('reads the connected state and timestamp from the envelope', async () => {
    server.use(
      http.get('*/operator/api/meta_connection', () =>
        HttpResponse.json({ data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' }, success: true }),
      ),
    )
    await expect(fetchMetaConnection()).resolves.toEqual({
      connected: true,
      connectedAt: Date.UTC(2026, 4, 1, 10, 0, 0),
    })
  })

  it('maps a not-connected response', async () => {
    server.use(
      http.get('*/operator/api/meta_connection', () =>
        HttpResponse.json({ data: { connected: false }, success: true }),
      ),
    )
    await expect(fetchMetaConnection()).resolves.toEqual({ connected: false, connectedAt: null })
  })

  it('sends the session token on the GET', async () => {
    let token: string | null = null
    server.use(
      http.get('*/operator/api/meta_connection', ({ request }) => {
        token = request.headers.get('X-Jwt-Token')
        return HttpResponse.json({ data: { connected: false }, success: true })
      }),
    )
    await fetchMetaConnection()
    expect(token).toBeTruthy()
  })

  it('rejects a 403 with the server message', async () => {
    server.use(http.get('*/operator/api/meta_connection', () => envelope(403, 'You are not authorized to perform this action')))
    await expect(fetchMetaConnection()).rejects.toEqual(new ApiError(403, 'You are not authorized to perform this action'))
  })

  it('rejects with no status on a network error', async () => {
    server.use(http.get('*/operator/api/meta_connection', () => HttpResponse.error()))
    await expect(fetchMetaConnection()).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})

describe('requestConnectToMeta', () => {
  it('POSTs and returns the connected state', async () => {
    let seen: { headers: Headers; body: unknown } | undefined
    server.use(
      http.post('*/operator/api/meta_connection', async ({ request }) => {
        seen = { headers: request.headers, body: await request.json().catch(() => null) }
        return HttpResponse.json({ data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' }, success: true })
      }),
    )
    await expect(requestConnectToMeta()).resolves.toMatchObject({ connected: true })
    expect(seen!.headers.get('X-Jwt-Token')).toBeTruthy()
  })

  it('rejects a 502 (Meta service unreachable or failing) with the server message', async () => {
    server.use(http.post('*/operator/api/meta_connection', () => envelope(502, 'Meta service is temporarily unavailable')))
    await expect(requestConnectToMeta()).rejects.toEqual(new ApiError(502, 'Meta service is temporarily unavailable'))
  })
})

describe('fetchMetaPages', () => {
  it('reads a list of pages from the envelope', async () => {
    server.use(
      http.get('*/operator/api/meta_credentials', () =>
        HttpResponse.json({
          data: [
            { id: 1, label: 'Main page', page_id: '12345', ad_account_id: 'act_678' },
            { id: 2, label: 'Second page', page_id: '98765', ad_account_id: null },
          ],
          success: true,
        }),
      ),
    )
    await expect(fetchMetaPages()).resolves.toEqual([
      { id: '1', label: 'Main page', pageId: '12345', adAccountId: 'act_678' },
      { id: '2', label: 'Second page', pageId: '98765', adAccountId: null },
    ])
  })

  it('rejects 422 "Tenant has no Meta connection" with the server message', async () => {
    server.use(http.get('*/operator/api/meta_credentials', () => envelope(422, 'Tenant has no Meta connection')))
    await expect(fetchMetaPages()).rejects.toEqual(new ApiError(422, 'Tenant has no Meta connection'))
  })
})

describe('requestCreateMetaPage', () => {
  const page = { label: 'Main', pageId: '12345', pageAccessToken: 'tok_secret', adAccountId: 'act_1' }

  it("posts the page in the server's field names and does not echo the token in the response", async () => {
    let seen: { body: unknown } | undefined
    server.use(
      http.post('*/operator/api/meta_credentials', async ({ request }) => {
        seen = { body: await request.json() }
        return HttpResponse.json({
          // The server strips the token from its as_json; the panel never sees it echoed.
          data: { id: 11, label: 'Main', page_id: '12345', ad_account_id: 'act_1' },
          success: true,
        })
      }),
    )
    await expect(requestCreateMetaPage(page)).resolves.toEqual({
      id: '11',
      label: 'Main',
      pageId: '12345',
      adAccountId: 'act_1',
    })
    expect(seen!.body).toEqual({ label: 'Main', page_id: '12345', page_access_token: 'tok_secret', ad_account_id: 'act_1' })
  })

  it.each([
    [422, 'Meta rejected this access token as invalid or expired'],
    [422, 'Label can’t be blank, Page can’t be blank'],
    [404, 'Page not found'],
    [502, 'Meta service is temporarily unavailable'],
  ])('rejects a %i with the server message', async (status, message) => {
    server.use(http.post('*/operator/api/meta_credentials', () => envelope(status, message)))
    await expect(requestCreateMetaPage(page)).rejects.toEqual(new ApiError(status, message))
  })

  it('gives up when the gateway never answers', async () => {
    server.use(
      http.post('*/operator/api/meta_credentials', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await expect(requestCreateMetaPage(page, )).rejects.toMatchObject({ status: NO_RESPONSE })
  }, 20_000)
})

describe('requestUpdateMetaPage', () => {
  it('PATCHes label and ad account, and omits the token when it is null', async () => {
    let seen: { body: unknown; url: string } | undefined
    server.use(
      http.patch('*/operator/api/meta_credentials/:id', async ({ request }) => {
        seen = { body: await request.json(), url: request.url }
        return HttpResponse.json({
          data: { id: 11, label: 'Renamed', page_id: '12345', ad_account_id: 'act_2' },
          success: true,
        })
      }),
    )
    await requestUpdateMetaPage('11', { label: 'Renamed', adAccountId: 'act_2', pageAccessToken: null })
    expect(new URL(seen!.url).pathname).toBe('/operator/api/meta_credentials/11')
    expect(seen!.body).toEqual({ label: 'Renamed', ad_account_id: 'act_2' })
  })

  it('includes the token when it is replaced', async () => {
    let seen: { body: unknown } | undefined
    server.use(
      http.patch('*/operator/api/meta_credentials/:id', async ({ request }) => {
        seen = { body: await request.json() }
        return HttpResponse.json({
          data: { id: 11, label: 'Renamed', page_id: '12345', ad_account_id: null },
          success: true,
        })
      }),
    )
    await requestUpdateMetaPage('11', { label: 'Renamed', adAccountId: null, pageAccessToken: 'tok_new' })
    expect(seen!.body).toEqual({ label: 'Renamed', ad_account_id: null, page_access_token: 'tok_new' })
  })
})
