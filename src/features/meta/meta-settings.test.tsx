import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { NO_ACCESS_MESSAGE } from '@/features/team/invite'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import { loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import {
  CONNECT_FIRST_MESSAGE,
  META_UNREACHABLE_MESSAGE,
  metaFailure,
  NOT_CONNECTED_SERVER_MESSAGE,
  useCreateMetaPage,
  useUpdateMetaPage,
} from './meta-settings'

function withQueryClient(): { wrapper: ({ children }: { children: ReactNode }) => ReactNode; queryClient: QueryClient } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { wrapper, queryClient }
}

describe('token is kept out of mutation variables (so React Query state never carries it)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
  })

  it('useCreateMetaPage: mutation.variables holds the redacted body, server still receives the real token', async () => {
    let bodyToServer: Record<string, unknown> | undefined
    server.use(
      http.post('*/operator/api/meta_credentials', async ({ request }) => {
        bodyToServer = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ data: { id: 1, label: 'Main', page_id: '123', ad_account_id: null }, success: true })
      }),
    )
    const token = 'tok_super_secret'
    const { wrapper } = withQueryClient()
    const { result } = renderHook(() => useCreateMetaPage(), { wrapper })

    result.current.mutate({ label: 'Main', pageId: '123', pageAccessToken: token, adAccountId: null })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The server got the real token (so the end-to-end flow still works) …
    expect(bodyToServer).toEqual({ label: 'Main', page_id: '123', page_access_token: token, ad_account_id: null })
    // … but the mutation state does not: no `pageAccessToken`, no `page_access_token`, nothing containing the token.
    const variables = result.current.variables as Record<string, unknown>
    expect(variables).not.toHaveProperty('pageAccessToken')
    expect(variables).not.toHaveProperty('page_access_token')
    expect(JSON.stringify(variables)).not.toContain(token)
  })

  it('useUpdateMetaPage: mutation.variables holds the redacted body, server still receives the replacement token', async () => {
    let bodyToServer: Record<string, unknown> | undefined
    server.use(
      http.patch('*/operator/api/meta_credentials/:id', async ({ request }) => {
        bodyToServer = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ data: { id: 1, label: 'Renamed', page_id: '123', ad_account_id: null }, success: true })
      }),
    )
    const token = 'tok_replacement'
    const { wrapper } = withQueryClient()
    const { result } = renderHook(() => useUpdateMetaPage(), { wrapper })

    result.current.mutate({ id: '1', update: { label: 'Renamed', adAccountId: null, pageAccessToken: token } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(bodyToServer).toEqual({ label: 'Renamed', ad_account_id: null, page_access_token: token })
    const variables = result.current.variables as { update: Record<string, unknown> }
    expect(variables.update).not.toHaveProperty('pageAccessToken')
    expect(variables.update).not.toHaveProperty('page_access_token')
    expect(JSON.stringify(variables)).not.toContain(token)
  })
})

describe('metaFailure', () => {
  it('maps 422 "Tenant has no Meta connection" to the connect-first state', () => {
    expect(metaFailure(new ApiError(422, NOT_CONNECTED_SERVER_MESSAGE))).toEqual({
      kind: 'not-connected',
      message: CONNECT_FIRST_MESSAGE,
    })
  })

  it('keeps the server message for other 422s (Meta token rejection, validation)', () => {
    expect(metaFailure(new ApiError(422, 'Meta rejected this access token as invalid or expired'))).toEqual({
      kind: 'other',
      message: 'Meta rejected this access token as invalid or expired',
    })
    expect(metaFailure(new ApiError(422, 'Label can’t be blank'))).toEqual({
      kind: 'other',
      message: 'Label can’t be blank',
    })
  })

  it('maps 502 to the Meta-unreachable stock message', () => {
    expect(metaFailure(new ApiError(502, 'anything'))).toEqual({
      kind: 'meta-unreachable',
      message: META_UNREACHABLE_MESSAGE,
    })
  })

  it.each([NO_RESPONSE, 500, 503, 504])('maps outage status %i to the standard unreachable message', (status) => {
    expect(metaFailure(new ApiError(status, 'anything'))).toEqual({ kind: 'outage', message: UNREACHABLE_MESSAGE })
  })

  it('maps 403 to the no-access message', () => {
    expect(metaFailure(new ApiError(403, 'You are not authorized'))).toEqual({
      kind: 'not-allowed',
      message: NO_ACCESS_MESSAGE,
    })
  })

  it('keeps the server message for a 404 (unknown page id)', () => {
    expect(metaFailure(new ApiError(404, 'Page not found'))).toEqual({ kind: 'other', message: 'Page not found' })
  })

  it('has a generic fallback for a non-ApiError', () => {
    expect(metaFailure(new TypeError('boom'))).toEqual({ kind: 'other', message: 'Something went wrong. Try again.' })
  })
})
