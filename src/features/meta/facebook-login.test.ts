import { describe, expect, it } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import {
  FACEBOOK_CALLBACK_MESSAGE_TYPE,
  FACEBOOK_SESSION_EXPIRED_MESSAGE,
  FACEBOOK_UNCONFIGURED_MESSAGE,
  facebookFailure,
  facebookRedirectUri,
  isFacebookCallbackMessage,
} from './facebook-login'
import { META_UNREACHABLE_MESSAGE } from './meta-settings'

describe('facebookFailure', () => {
  it('maps 503 to the unconfigured state (defensive — the button should be hidden before this fires)', () => {
    expect(facebookFailure(new ApiError(503, 'Facebook login isn’t configured'))).toEqual({
      kind: 'unconfigured',
      message: FACEBOOK_UNCONFIGURED_MESSAGE,
    })
  })

  it('maps 410 to session-expired so the UI drops back to the Log in with Facebook button', () => {
    expect(facebookFailure(new ApiError(410, 'Your Facebook login has expired. Please log in again.'))).toEqual({
      kind: 'session-expired',
      message: FACEBOOK_SESSION_EXPIRED_MESSAGE,
    })
  })

  it('maps 502 to the Meta-unreachable stock message (reused from OW-10)', () => {
    expect(facebookFailure(new ApiError(502, 'anything from Meta'))).toEqual({
      kind: 'meta-unreachable',
      message: META_UNREACHABLE_MESSAGE,
    })
  })

  it.each([NO_RESPONSE, 500, 503, 504])('does not treat %i as unconfigured when it isn’t exactly 503', (status) => {
    if (status === 503) return // the 503 case is covered above
    expect(facebookFailure(new ApiError(status, 'x'))).toEqual({ kind: 'outage', message: UNREACHABLE_MESSAGE })
  })

  it('maps 403 to the no-access message', () => {
    expect(facebookFailure(new ApiError(403, 'You are not authorized'))).toEqual({
      kind: 'not-allowed',
      message: 'You don’t have access to this.',
    })
  })

  it("keeps the server message for 422 (Meta rejection, verification failure, cancelled etc.)", () => {
    expect(facebookFailure(new ApiError(422, "Meta rejected this Page's access token as invalid or expired"))).toEqual({
      kind: 'other',
      message: "Meta rejected this Page's access token as invalid or expired",
    })
    expect(facebookFailure(new ApiError(422, 'Facebook login could not be verified. Please try again.'))).toEqual({
      kind: 'other',
      message: 'Facebook login could not be verified. Please try again.',
    })
  })

  it('has a generic fallback for a non-ApiError', () => {
    expect(facebookFailure(new TypeError('boom'))).toEqual({ kind: 'other', message: 'Something went wrong. Try again.' })
  })
})

describe('isFacebookCallbackMessage', () => {
  it('accepts a well-formed message', () => {
    expect(
      isFacebookCallbackMessage({ type: FACEBOOK_CALLBACK_MESSAGE_TYPE, code: 'c', stateToken: 's' }),
    ).toBe(true)
  })

  it('rejects anything without the exact type tag (postMessage security — any site can post anything)', () => {
    expect(isFacebookCallbackMessage({ type: 'something-else', code: 'c', stateToken: 's' })).toBe(false)
    expect(isFacebookCallbackMessage(null)).toBe(false)
    expect(isFacebookCallbackMessage('oauth')).toBe(false)
    expect(isFacebookCallbackMessage(undefined)).toBe(false)
  })
})

describe('facebookRedirectUri', () => {
  it('builds the callback path from the given origin (NOT under /t so the popup isn’t bounced by the admin guard)', () => {
    expect(facebookRedirectUri('https://staging.ranwinlabs.com')).toBe('https://staging.ranwinlabs.com/meta/facebook/callback')
  })
})
