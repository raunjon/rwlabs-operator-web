import { describe, expect, it } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { NO_ACCESS_MESSAGE } from '@/features/team/invite'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import { HAS_EVENTS_MESSAGE, HAS_EVENTS_SERVER_MESSAGE, VENUE_NOT_FOUND_MESSAGE, venueFailure } from './venues'

describe('venueFailure', () => {
  it('404: the venue doesn’t exist', () => {
    expect(VENUE_NOT_FOUND_MESSAGE).toBe('This venue doesn’t exist.')
    expect(venueFailure(new ApiError(404, "Couldn't find Venue with 'id'=99"))).toEqual({
      kind: 'not-found',
      message: VENUE_NOT_FOUND_MESSAGE,
    })
  })

  it('403: no access', () => {
    expect(venueFailure(new ApiError(403, 'You are not authorized to view or edit this content.'))).toEqual({
      kind: 'not-allowed',
      message: NO_ACCESS_MESSAGE,
    })
  })

  it('422 for a venue with events is told apart by the operator’s fixed message, and keeps it', () => {
    expect(HAS_EVENTS_SERVER_MESSAGE).toBe('Cannot delete record because dependent events exist')
    expect(HAS_EVENTS_MESSAGE).toBe('This venue has events scheduled; delete those first.')
    expect(venueFailure(new ApiError(422, HAS_EVENTS_SERVER_MESSAGE))).toEqual({
      kind: 'has-events',
      message: HAS_EVENTS_MESSAGE,
      serverMessage: HAS_EVENTS_SERVER_MESSAGE,
    })
  })

  it('any other 422 keeps the server’s joined validation message', () => {
    expect(venueFailure(new ApiError(422, "Name can't be blank"))).toEqual({
      kind: 'other',
      message: "Name can't be blank",
    })
  })

  it.each([502, 500, 503, NO_RESPONSE])('%i: the standard unreachable message', (status) => {
    expect(venueFailure(new ApiError(status, 'Request failed'))).toEqual({
      kind: 'outage',
      message: UNREACHABLE_MESSAGE,
    })
  })

  it('anything that isn’t an ApiError gets a generic message', () => {
    expect(venueFailure(new TypeError('boom'))).toEqual({ kind: 'other', message: 'Something went wrong. Try again.' })
  })
})
