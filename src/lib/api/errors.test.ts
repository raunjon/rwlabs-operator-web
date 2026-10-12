import { describe, expect, it } from 'vitest'
import { ApiError, toApiError } from './errors'

describe('toApiError', () => {
  it('reads the presentable error envelope', () => {
    const error = toApiError(422, { error: { message: "Name can't be blank", status: 422 }, success: false })
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.message).toBe("Name can't be blank")
  })

  it('reads a plain string body (presentable admin validation errors)', () => {
    expect(toApiError(422, 'Name is too long').message).toBe('Name is too long')
  })

  it('falls back to a generic message for anything else', () => {
    expect(toApiError(502, '').message).toBe('Request failed (502)')
    expect(toApiError(500, null).message).toBe('Request failed (500)')
    expect(toApiError(500, { error: { message: '' } }).message).toBe('Request failed (500)')
    expect(toApiError(500, { error: 'boom' }).message).toBe('Request failed (500)')
  })

  it('does not show an HTML error page as a message', () => {
    expect(toApiError(502, '<html><body>Bad Gateway</body></html>').message).toBe('Request failed (502)')
  })
})
