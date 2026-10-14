import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import type { FacebookPage } from './api'
import {
  FACEBOOK_CALLBACK_PATH,
  FACEBOOK_CANCELLED_MESSAGE,
  FACEBOOK_NO_PAGES_MESSAGE,
  facebookFailure,
  facebookRedirectUri,
  isFacebookCallbackMessage,
  useCreateFacebookCredential,
  useFacebookAuthorizeUrl,
  useFacebookPages,
  type FacebookFailure,
} from './facebook-login'

// Fixed popup window size for the OAuth dialog. Facebook renders mobile-sized by default; this is big enough for
// the "pick accounts and permissions" screen without going full-page.
const POPUP_FEATURES = 'width=600,height=700'
const POPUP_NAME = 'fb-login'

// OW-13: a "Log in with Facebook" card above the manual Add-a-page form on /t/settings/meta. The admin clicks the
// button, Facebook's OAuth dialog opens in a popup, the panel's callback route postMessages the code+state back,
// this card exchanges them for the admin's Pages list, and the admin picks one to connect. The manual form stays
// as a fallback; it isn't touched by this flow.
//
// Visibility is gated by the parent on `connection.facebookLoginAvailable` so the card never renders in
// environments without a Facebook App configured.
export function FacebookLoginCard() {
  const [stateToken, setStateToken] = useState<string | null>(null)
  const [pages, setPages] = useState<FacebookPage[] | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [justConnected, setJustConnected] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)
  // Pointer to the currently-open popup so we can detect a user who closed it without finishing.
  const popupRef = useRef<Window | null>(null)
  const redirectUri = facebookRedirectUri()

  const authorize = useFacebookAuthorizeUrl()
  const exchange = useFacebookPages()
  const connect = useCreateFacebookCredential()

  const failure: FacebookFailure | null =
    exchange.error && !exchange.isPending
      ? facebookFailure(exchange.error)
      : connect.error && !connect.isPending
        ? facebookFailure(connect.error)
        : authorize.error && !authorize.isPending
          ? facebookFailure(authorize.error)
          : cancelled
            ? { kind: 'other', message: FACEBOOK_CANCELLED_MESSAGE }
            : null

  // Returning to the button after a session has expired or a successful credential: drop the picker state.
  function reset() {
    setStateToken(null)
    setPages(null)
    setSessionId(null)
    setCancelled(false)
    exchange.reset()
    connect.reset()
    authorize.reset()
  }

  function startLogin() {
    setJustConnected(null)
    setCancelled(false)
    exchange.reset()
    connect.reset()
    // Open the popup synchronously inside the click handler. Browsers only allow window.open on a transient
    // user-activation window; opening it after an awaited fetch (even one that resolves in <100ms) gets blocked
    // and silently returns null in Safari and some Chromium configurations. Navigate the pre-opened window to the
    // real authorize URL once the authorize request resolves; close it if the request fails.
    const popup = window.open('about:blank', POPUP_NAME, POPUP_FEATURES)
    popupRef.current = popup
    authorize.mutate(redirectUri, {
      onSuccess: ({ authorizeUrl, stateToken: token }) => {
        setStateToken(token)
        if (popup && !popup.closed) popup.location.href = authorizeUrl
      },
      onError: () => {
        if (popup && !popup.closed) popup.close()
        popupRef.current = null
      },
    })
  }

  // Listens for the callback window's postMessage. Verifies the sender's origin (postMessage security — any site
  // can post from any origin, so the check is mandatory) and the state token (binds the message to the login we
  // actually started). On a verified message, exchange the code for the Pages list.
  useEffect(() => {
    if (!stateToken) return
    const expectedToken = stateToken

    function handle(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (!isFacebookCallbackMessage(event.data)) return
      if (event.data.stateToken !== expectedToken) return

      popupRef.current?.close()
      popupRef.current = null

      if (!event.data.code) {
        // Facebook returned without a code (user cancelled or denied). Keep the button, show the cancelled copy.
        setStateToken(null)
        setCancelled(true)
        exchange.reset()
        return
      }

      exchange.mutate(
        { code: event.data.code, stateToken: expectedToken, redirectUri },
        {
          onSuccess: ({ sessionId: sid, pages: list }) => {
            setSessionId(sid)
            setPages(list)
          },
        },
      )
    }

    window.addEventListener('message', handle)
    return () => window.removeEventListener('message', handle)
  }, [stateToken, exchange, redirectUri])

  function pick(page: FacebookPage) {
    if (!sessionId) return
    connect.mutate(
      { sessionId, pageId: page.id, label: page.name, adAccountId: null },
      {
        onSuccess: (credential) => {
          setJustConnected(credential.label)
          // One session_id is one credential: drop it so the admin can start a new login for the next page.
          reset()
        },
      },
    )
  }

  const sessionExpired = failure?.kind === 'session-expired'
  // After a session-expired on connect we show the button again, not the pages list.
  const showPages = pages !== null && !sessionExpired
  const busy = authorize.isPending || exchange.isPending
  const connecting = connect.isPending
  const noPages = showPages && pages.length === 0

  return (
    <section aria-labelledby="meta-facebook-login-heading">
      <Card>
        <CardHeader>
          <h2 id="meta-facebook-login-heading" className="font-semibold">
            Log in with Facebook
          </h2>
          <CardDescription>
            Pick a Page straight from your Facebook account instead of pasting a page id and token by hand.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {justConnected && !showPages && !failure && (
            <Alert variant="success">
              <AlertDescription>Connected {justConnected}.</AlertDescription>
            </Alert>
          )}
          {failure && (
            <Alert variant={failure.kind === 'session-expired' ? 'info' : 'destructive'}>
              <AlertDescription>{failure.message}</AlertDescription>
            </Alert>
          )}
          {!showPages ? (
            <Button type="button" onClick={startLogin} disabled={busy}>
              {busy ? 'Opening Facebook…' : 'Log in with Facebook'}
            </Button>
          ) : noPages ? (
            <>
              <Alert variant="info">
                <AlertDescription>{FACEBOOK_NO_PAGES_MESSAGE}</AlertDescription>
              </Alert>
              <Button type="button" variant="outline" onClick={reset}>
                Try again
              </Button>
            </>
          ) : (
            <ul className="divide-y divide-border">
              {pages.map((page) => (
                <li key={page.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{page.name}</p>
                    <p className="text-muted-foreground">Facebook page {page.id}</p>
                    {!page.accessTokenPresent && (
                      <p className="text-muted-foreground">
                        No access token available for this Page. Facebook may not have granted the required
                        permissions.
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => pick(page)}
                    disabled={connecting || !page.accessTokenPresent}
                  >
                    {connecting ? 'Connecting…' : 'Connect this page'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {showPages && !noPages && (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={reset} disabled={connecting}>
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

// Re-exported for the callback route to import without pulling in the whole card module.
export { FACEBOOK_CALLBACK_PATH, FACEBOOK_CANCELLED_MESSAGE }
