import { ApiError } from './errors'

// The app's query retry rule (main.tsx). React Query's default retries three times with backoff whatever the
// error, which keeps an answer that won't change (a 404 for a missing event, a 403) behind a skeleton for
// several seconds. Refusals show at once; outages and unexpected errors still get three retries.
export function retryUnlessRefused(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
  return failureCount < 3
}
