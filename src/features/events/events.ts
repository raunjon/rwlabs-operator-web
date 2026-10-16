import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { NO_ACCESS_MESSAGE } from '@/features/team/invite'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import {
  fetchEvent,
  fetchEvents,
  fetchVenues,
  requestCreateEvent,
  requestDeleteEvent,
  requestUpdateEvent,
  type EventInput,
  type EventListParams,
} from './api'

export const EVENT_NOT_FOUND_MESSAGE = 'This event doesn’t exist, or you don’t have access to it.'

// The operator's fixed message when a super admin creates an event without a tenant (OS-35). Matched verbatim so
// the form can show it at the Tenant id field instead of at form level.
export const TENANT_REQUIRED_SERVER_MESSAGE = 'Tenant required'

export type EventFailure =
  // 404: the event doesn't exist, or (for a tenant admin) belongs to another tenant. The operator answers both
  // the same way, so the panel does too.
  | { kind: 'not-found'; message: string }
  // 403: defensive; the /t and /admin guards already keep other roles out.
  | { kind: 'not-allowed'; message: string }
  // 422 "Tenant required": a super admin's create without tenant_id. Shown at the Tenant id field.
  | { kind: 'tenant-required'; message: string }
  // No answer from the gateway, or a 5xx.
  | { kind: 'outage'; message: string }
  // Everything else, validation 422s included: the server's own (joined) words, shown at form level.
  | { kind: 'other'; message: string }

export function eventFailure(error: unknown): EventFailure {
  if (!(error instanceof ApiError)) return { kind: 'other', message: 'Something went wrong. Try again.' }
  if (error.status === 404) return { kind: 'not-found', message: EVENT_NOT_FOUND_MESSAGE }
  if (error.status === 403) return { kind: 'not-allowed', message: NO_ACCESS_MESSAGE }
  if (error.status === 422 && error.message === TENANT_REQUIRED_SERVER_MESSAGE) {
    return { kind: 'tenant-required', message: error.message }
  }
  if (error.status === NO_RESPONSE || error.status >= 500) return { kind: 'outage', message: UNREACHABLE_MESSAGE }
  return { kind: 'other', message: error.message }
}

const EVENTS_KEY = ['events'] as const

export const eventsQuery = (params: EventListParams) =>
  queryOptions({
    queryKey: [...EVENTS_KEY, 'list', params],
    queryFn: () => fetchEvents(params),
    // No placeholder data: after a page or filter change, the old rows would sit under the new URL and controls
    // until the request settles. The list shows its loading skeleton instead.
  })

export const eventQuery = (id: number) =>
  queryOptions({
    queryKey: [...EVENTS_KEY, 'detail', id],
    queryFn: () => fetchEvent(id),
  })

export const venuesQuery = queryOptions({
  queryKey: ['venues'],
  queryFn: fetchVenues,
  // Venues change rarely (only a super admin edits them) and fill dropdowns on every event screen.
  staleTime: 5 * 60_000,
})

export function useCreateEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: EventInput) => requestCreateEvent(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...EVENTS_KEY, 'list'] }),
  })
}

export function useUpdateEvent(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: EventInput) => requestUpdateEvent(id, input),
    onSuccess: (event) => {
      queryClient.setQueryData(eventQuery(id).queryKey, event)
      return queryClient.invalidateQueries({ queryKey: [...EVENTS_KEY, 'list'] })
    },
  })
}

export function useDeleteEvent(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => requestDeleteEvent(id),
    onSuccess: () => {
      // Dropped rather than invalidated: a refetch would only find a 404 for the page we're leaving.
      queryClient.removeQueries({ queryKey: eventQuery(id).queryKey })
      return queryClient.invalidateQueries({ queryKey: [...EVENTS_KEY, 'list'] })
    },
  })
}
