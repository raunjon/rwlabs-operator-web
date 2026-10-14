import { getRouteApi } from '@tanstack/react-router'
import { useEffect } from 'react'
import { FACEBOOK_CALLBACK_MESSAGE_TYPE, type FacebookCallbackMessage } from './facebook-login'

const route = getRouteApi('/meta/facebook/callback')

// OW-13: the Facebook OAuth popup lands here after the admin finishes (or cancels) the login. The route reads
// `?code=` and `?state=` from the URL, postMessages them back to the opener window, and closes itself. The opener
// (the Meta settings page) verifies the sender's origin and the state token before trusting the message.
//
// A user who navigates here directly (no opener, e.g. following a stale email link) sees a one-line fallback.
export function FacebookCallbackPage() {
  const { code, state, error } = route.useSearch()
  const opener = typeof window !== 'undefined' ? window.opener : null

  useEffect(() => {
    if (!opener) return
    const message: FacebookCallbackMessage = {
      type: FACEBOOK_CALLBACK_MESSAGE_TYPE,
      // Facebook returns `error=access_denied` (and sometimes no `code`) when the user cancels or denies
      // permissions; collapse both into "no code" so the opener's cancellation branch handles it.
      code: error ? null : (code ?? null),
      stateToken: state ?? null,
    }
    opener.postMessage(message, window.location.origin)
    window.close()
  }, [code, state, error, opener])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">
        {opener
          ? 'Finishing Facebook login…'
          : 'This page is used by Facebook login. You can close it.'}
      </p>
    </main>
  )
}
