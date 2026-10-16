import { describe, expect, it } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { NO_ACCESS_MESSAGE } from '@/features/team/invite'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import { EVENT_NOT_FOUND_MESSAGE, eventFailure, TENANT_REQUIRED_SERVER_MESSAGE } from './events'

describe('eventFailure', () => {
  it('404: the event is gone or belongs to another tenant (one message for both)', () => {
    expect(EVENT_NOT_FOUND_MESSAGE).toBe('This event doesn’t exist, or you don’t have access to it.')
    expect(eventFailure(new ApiError(404, "Couldn't find Event with 'id'=99"))).toEqual({
      kind: 'not-found',
      message: EVENT_NOT_FOUND_MESSAGE,
    })
  })

  it('403: no access', () => {
    expect(eventFailure(new ApiError(403, 'You are not authorized to view or edit this content.'))).toEqual({
      kind: 'not-allowed',
      message: NO_ACCESS_MESSAGE,
    })
  })

  it('422 "Tenant required" is told apart by the operator’s fixed message, and keeps it for the field', () => {
    expect(TENANT_REQUIRED_SERVER_MESSAGE).toBe('Tenant required')
    expect(eventFailure(new ApiError(422, 'Tenant required'))).toEqual({
      kind: 'tenant-required',
      message: 'Tenant required',
    })
  })

  it('any other 422 keeps the server’s joined validation message', () => {
    expect(eventFailure(new ApiError(422, "Title can't be blank, End time must be after start time"))).toEqual({
      kind: 'other',
      message: "Title can't be blank, End time must be after start time",
    })
    expect(
      eventFailure(new ApiError(422, 'This record cannot be deleted because other records depend on it.')),
    ).toEqual({ kind: 'other', message: 'This record cannot be deleted because other records depend on it.' })
  })

  it.each([502, 500, 503, NO_RESPONSE])('%i: the standard unreachable message', (status) => {
    expect(eventFailure(new ApiError(status, 'Request failed'))).toEqual({
      kind: 'outage',
      message: UNREACHABLE_MESSAGE,
    })
  })

  it('anything that isn’t an ApiError gets a generic message', () => {
    expect(eventFailure(new TypeError('boom'))).toEqual({ kind: 'other', message: 'Something went wrong. Try again.' })
  })
})
