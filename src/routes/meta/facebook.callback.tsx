import { createFileRoute } from '@tanstack/react-router'
import { FacebookCallbackPage } from '@/features/meta/facebook-callback-page'

export interface FacebookCallbackSearch {
  // Facebook returns these three on the OAuth redirect; validate them to strings or drop them.
  code?: string
  state?: string
  error?: string
}

// Public: deliberately NOT under /_authenticated. The Facebook OAuth popup opens as a new browsing context, so
// the admin's session JWT (in sessionStorage) isn't available here, and the admin guard on /t would redirect this
// to /login before the component ever mounted. All this route does is read the OAuth query, postMessage it to the
// opener window, and close itself — no API calls, no state, no privileged data on this origin.
export const Route = createFileRoute('/meta/facebook/callback')({
  validateSearch: (search: Record<string, unknown>): FacebookCallbackSearch => ({
    code: typeof search.code === 'string' && search.code ? search.code : undefined,
    state: typeof search.state === 'string' && search.state ? search.state : undefined,
    error: typeof search.error === 'string' && search.error ? search.error : undefined,
  }),
  component: FacebookCallbackPage,
})
