import { describe, expect, it } from 'vitest'
import { ApiError, NO_RESPONSE } from './errors'
import { retryUnlessRefused } from './retry'

describe('retryUnlessRefused', () => {
  it('doesn’t retry an answer that won’t change (4xx), so a missing event shows at once', () => {
    expect(retryUnlessRefused(0, new ApiError(404, 'not found'))).toBe(false)
    expect(retryUnlessRefused(0, new ApiError(403, 'no'))).toBe(false)
  })

  it('retries outages up to three times', () => {
    expect(retryUnlessRefused(0, new ApiError(NO_RESPONSE, 'x'))).toBe(true)
    expect(retryUnlessRefused(2, new ApiError(502, 'x'))).toBe(true)
    expect(retryUnlessRefused(3, new ApiError(502, 'x'))).toBe(false)
  })
})
