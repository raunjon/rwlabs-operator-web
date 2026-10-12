import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
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
