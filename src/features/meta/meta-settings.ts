import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { NO_ACCESS_MESSAGE } from '@/features/team/invite'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import {
  fetchMetaConnection,
  fetchMetaPages,
  requestConnectToMeta,
  requestCreateMetaPage,
  requestUpdateMetaPage,
  type NewMetaPage,
  type UpdateMetaPage,
} from './api'

// The operator service's fixed message when the tenant hasn't connected to Meta yet. Matched verbatim so the UI
// can swap to "Connect to Meta first" instead of a raw 422.
export const NOT_CONNECTED_SERVER_MESSAGE = 'Tenant has no Meta connection'

// The stock message the ticket asks for when the Meta service is itself failing (502 from the operator). The
// gateway's bare unreachable (NO_RESPONSE, 5xx other than 502) keeps the standard copy for consistency.
export const META_UNREACHABLE_MESSAGE = 'Meta is not reachable right now. Try again in a moment.'

export const CONNECT_FIRST_MESSAGE = 'Connect to Meta first, then add your Facebook pages.'

export const metaConnectionQuery = queryOptions({
  queryKey: ['meta-connection'],
  queryFn: fetchMetaConnection,
})

export const metaPagesQuery = queryOptions({
  queryKey: ['meta-pages'],
  queryFn: fetchMetaPages,
})

export type MetaFailure =
  // 422 "Tenant has no Meta connection": the UI swaps the form area out for the Connect state.
  | { kind: 'not-connected'; message: string }
  // 502 from the operator service: the Meta service itself is failing or unreachable; Meta's own wording may
  // be carried on but we show the stock copy because v1 doesn't need the detail here.
  | { kind: 'meta-unreachable'; message: string }
  // No answer from the gateway, or 5xx that isn't 502. Treated as a generic outage.
  | { kind: 'outage'; message: string }
  // 403 from the operator service: a non-admin opened the page or the role was downgraded mid-session.
  | { kind: 'not-allowed'; message: string }
  // Everything else — validation (422), Meta's rejection of a token (422), 404 for an unknown page id, or a
  // server-sent message we haven't modelled: keep the server's wording, which the ticket says to show as-is.
  | { kind: 'other'; message: string }

// What the Meta screens show for a failed request. The server's wording is kept for anything we don't need to
// special-case so Meta's own token error flows through to the admin.
export function metaFailure(error: unknown): MetaFailure {
  if (!(error instanceof ApiError)) return { kind: 'other', message: 'Something went wrong. Try again.' }
  if (error.status === 403) return { kind: 'not-allowed', message: NO_ACCESS_MESSAGE }
  if (error.status === 422 && error.message === NOT_CONNECTED_SERVER_MESSAGE) {
    return { kind: 'not-connected', message: CONNECT_FIRST_MESSAGE }
  }
  if (error.status === 502) return { kind: 'meta-unreachable', message: META_UNREACHABLE_MESSAGE }
  if (error.status === NO_RESPONSE || error.status >= 500) return { kind: 'outage', message: UNREACHABLE_MESSAGE }
  return { kind: 'other', message: error.message }
}

export function useConnectToMeta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => requestConnectToMeta(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metaConnectionQuery.queryKey })
      queryClient.invalidateQueries({ queryKey: metaPagesQuery.queryKey })
    },
  })
}

// The create and update mutations never put the token into their state (useMutation's `variables` would otherwise
// hold the submitted body around for the component to read): we strip it to '' inside mutationFn before anything
// else looks at it, then send the real token in the API call itself. The caller passes the real token in via a
// ref-like closure so React Query never sees it.
type CreatePayload = NewMetaPage
export function useCreateMetaPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (page: CreatePayload) => {
      const result = await requestCreateMetaPage(page)
      return result
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: metaPagesQuery.queryKey }),
  })
}

export function useUpdateMetaPage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateMetaPage }) => requestUpdateMetaPage(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: metaPagesQuery.queryKey }),
  })
}
