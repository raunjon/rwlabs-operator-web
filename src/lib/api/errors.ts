export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function envelopeMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined
  const { error } = body as { error: unknown }
  if (typeof error !== 'object' || error === null || !('message' in error)) return undefined
  const { message } = error as { message: unknown }
  return typeof message === 'string' && message.trim() ? message : undefined
}

// Turns any error response body into an ApiError. Understands the presentable gem's envelope
// ({ error: { message, status }, success: false }) and its plain-string admin validation errors.
export function toApiError(status: number, body: unknown): ApiError {
  const fromEnvelope = envelopeMessage(body)
  if (fromEnvelope) return new ApiError(status, fromEnvelope)
  if (typeof body === 'string' && body.trim() && !body.trimStart().startsWith('<')) {
    return new ApiError(status, body.trim())
  }
  return new ApiError(status, `Request failed (${status})`)
}
