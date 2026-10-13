import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { requestCreateInvitation } from './api'

// What the gateway sends for POST /auth/api/invitations once GAT-5 is in (auth's 201 arrives as 200).
const created = {
  id: 12,
  tenant_id: 3,
  invited_by_id: 7,
  email: 'new@example.com',
  role: 'event_manager',
  expires_at: 1_900_000_000,
  expires_at_display: '17 Mar 2030',
  accept_token: 'raw-invite-token',
}

describe('requestCreateInvitation', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
  })

  it('posts the email and role and returns the invitation with its accept token', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('*/auth/api/invitations', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: created, success: true, invited_at: 1 })
      }),
    )

    await expect(requestCreateInvitation({ email: 'new@example.com', role: 'event_manager' })).resolves.toEqual({
      email: 'new@example.com',
      role: 'event_manager',
      expiresAt: 1_900_000_000_000,
      acceptToken: 'raw-invite-token',
    })
    expect(bodies).toEqual([{ email: 'new@example.com', role: 'event_manager' }])
  })

  it('reports a missing accept token as null rather than failing: the invitation exists either way', async () => {
    const withoutToken: Record<string, unknown> = { ...created }
    delete withoutToken.accept_token
    server.use(http.post('*/auth/api/invitations', () => HttpResponse.json({ data: withoutToken, success: true })))
    await expect(requestCreateInvitation({ email: 'new@example.com', role: 'admin' })).resolves.toMatchObject({
      acceptToken: null,
    })
  })

  it('rejects a success without an invitation in it', async () => {
    server.use(http.post('*/auth/api/invitations', () => HttpResponse.json({ success: true })))
    await expect(requestCreateInvitation({ email: 'new@example.com', role: 'admin' })).rejects.toMatchObject({
      message: 'The server sent an unexpected response',
    })
  })
})
