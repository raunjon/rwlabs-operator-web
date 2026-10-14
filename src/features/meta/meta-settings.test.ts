import { describe, expect, it } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { NO_ACCESS_MESSAGE } from '@/features/team/invite'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import {
  CONNECT_FIRST_MESSAGE,
  META_UNREACHABLE_MESSAGE,
  metaFailure,
  NOT_CONNECTED_SERVER_MESSAGE,
} from './meta-settings'

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
