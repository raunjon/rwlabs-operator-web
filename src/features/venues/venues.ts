import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { NO_ACCESS_MESSAGE } from '@/features/team/invite'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import {
  fetchVenue,
  fetchVenuePage,
  requestCreateVenue,
  requestDeleteVenue,
  requestUpdateVenue,
  type VenueInput,
} from './api'

export const VENUE_NOT_FOUND_MESSAGE = 'This venue doesn’t exist.'

// The operator's fixed message (Rails' restrict_with_error) when events still point at the venue. Matched verbatim
// to tell it apart from validation 422s; the panel puts it in friendlier words and keeps the original beside them.
export const HAS_EVENTS_SERVER_MESSAGE = 'Cannot delete record because dependent events exist'
export const HAS_EVENTS_MESSAGE = 'This venue has events scheduled; delete those first.'

export type VenueFailure =
  | { kind: 'not-found'; message: string }
  // 403: defensive; the /admin guard keeps tenant admins away from the writes.
  | { kind: 'not-allowed'; message: string }
  // 422 on delete: events still use the venue.
  | { kind: 'has-events'; message: string; serverMessage: string }
  // No answer from the gateway, or a 5xx.
  | { kind: 'outage'; message: string }
  // Everything else, validation 422s included: the server's own (joined) words, shown at form level.
  | { kind: 'other'; message: string }

export function venueFailure(error: unknown): VenueFailure {
  if (!(error instanceof ApiError)) return { kind: 'other', message: 'Something went wrong. Try again.' }
  if (error.status === 404) return { kind: 'not-found', message: VENUE_NOT_FOUND_MESSAGE }
  if (error.status === 403) return { kind: 'not-allowed', message: NO_ACCESS_MESSAGE }
  if (error.status === 422 && error.message === HAS_EVENTS_SERVER_MESSAGE) {
    return { kind: 'has-events', message: HAS_EVENTS_MESSAGE, serverMessage: error.message }
  }
  if (error.status === NO_RESPONSE || error.status >= 500) return { kind: 'outage', message: UNREACHABLE_MESSAGE }
  return { kind: 'other', message: error.message }
}

// The events screens' venue picker is cached under ['venues'] too (events/events.ts), so invalidating this key
// after a venue write refreshes the picker as well.
const VENUES_KEY = ['venues'] as const

export const venuePageQuery = (page: number) =>
  queryOptions({
    queryKey: [...VENUES_KEY, 'page', page],
    queryFn: () => fetchVenuePage(page),
    // No placeholder data: the previous page's rows would sit under the new page number until the request
    // settles. The list shows its loading skeleton instead (as the events list does).
  })

export const venueQuery = (id: number) =>
  queryOptions({
    queryKey: [...VENUES_KEY, 'detail', id],
    queryFn: () => fetchVenue(id),
  })

export function useCreateVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: VenueInput) => requestCreateVenue(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: VENUES_KEY }),
  })
}

export function useUpdateVenue(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: VenueInput) => requestUpdateVenue(id, input),
    onSuccess: (venue) => {
      queryClient.setQueryData(venueQuery(id).queryKey, venue)
      // Everything else under ['venues']: the list pages and the events' picker. The detail just set stays.
      return queryClient.invalidateQueries({
        queryKey: VENUES_KEY,
        predicate: (query) => query.queryKey[1] !== 'detail',
      })
    },
  })
}

export function useDeleteVenue(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => requestDeleteVenue(id),
    onSuccess: () => {
      // Dropped rather than invalidated: a refetch would only find a 404 for the page we're leaving.
      queryClient.removeQueries({ queryKey: venueQuery(id).queryKey })
      return queryClient.invalidateQueries({ queryKey: VENUES_KEY })
    },
  })
}
