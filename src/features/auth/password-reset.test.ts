import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { NO_RESPONSE } from './api'
import {
  forgotFailure,
  RESET_LINK_INVALID_MESSAGE,
  resetFailure,
} from './password-reset'
import { UNREACHABLE_MESSAGE } from './session-actions'

const GENERIC = 'Something went wrong. Try again.'

describe('forgotFailure', () => {
  it.each([NO_RESPONSE, 500, 502, 503])('explains an outage for status %i', (status) => {
    expect(forgotFailure(new ApiError(status, 'anything'))).toEqual({ message: UNREACHABLE_MESSAGE })
  })

  it('does not pass through server messages (so the page can’t leak account existence)', () => {
    expect(forgotFailure(new ApiError(400, 'No account found for that email'))).toEqual({ message: GENERIC })
    expect(forgotFailure(new ApiError(422, 'Email is invalid'))).toEqual({ message: GENERIC })
  })

  it('has a generic message for anything unexpected', () => {
    expect(forgotFailure(new TypeError('boom'))).toEqual({ message: GENERIC })
  })
})

describe('resetFailure', () => {
  it('treats a 404 as the link no longer being valid', () => {
    expect(resetFailure(new ApiError(404, 'Reset link is invalid or has expired'))).toEqual({
      kind: 'invalid',
      message: RESET_LINK_INVALID_MESSAGE,
    })
  })

  it("keeps the server's wording for validation errors", () => {
    expect(resetFailure(new ApiError(422, 'Password is too short'))).toEqual({ kind: 'other', message: 'Password is too short' })
  })

  it.each([NO_RESPONSE, 500, 502])('explains an outage for status %i', (status) => {
    expect(resetFailure(new ApiError(status, 'x'))).toEqual({ kind: 'other', message: UNREACHABLE_MESSAGE })
  })

  it('has a generic message for anything unexpected', () => {
    expect(resetFailure(new TypeError('boom'))).toEqual({ kind: 'other', message: GENERIC })
  })
})
