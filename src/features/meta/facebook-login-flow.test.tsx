import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import {
  FACEBOOK_CALLBACK_MESSAGE_TYPE,
  FACEBOOK_POPUP_BLOCKED_MESSAGE,
  FACEBOOK_SESSION_EXPIRED_MESSAGE,
} from './facebook-login'
import { META_UNREACHABLE_MESSAGE } from './meta-settings'

// Reuses the OW-10 pages pattern: /meta_connection first (now with facebook_login_available), /meta_credentials
// list, then the three Facebook endpoints. All mocked at the gateway path through MSW.

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

function mockConnection(facebookLoginAvailable: boolean) {
  server.use(
    http.get('*/operator/api/meta_connection', () =>
      HttpResponse.json({
        data: {
          connected: true,
          connected_at: '2026-05-01T10:00:00.000Z',
          facebook_login_available: facebookLoginAvailable,
        },
        success: true,
      }),
    ),
  )
}

function mockEmptyPages() {
  server.use(http.get('*/operator/api/meta_credentials', () => HttpResponse.json({ data: [], success: true })))
}

function mockAuthorize(respond: () => Response | Promise<Response>) {
  server.use(http.get('*/operator/api/facebook_login/authorize_url', () => respond()))
}

function mockFbPages(respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post('*/operator/api/facebook_login/pages', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      bodies.push(body)
      return respond(body)
    }),
  )
  return bodies
}

function mockFbCredentials(respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post('*/operator/api/facebook_login/credentials', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      bodies.push(body)
      return respond(body)
    }),
  )
  return bodies
}

// Fires the postMessage the Facebook OAuth callback page would send after Facebook redirects back. We stub
// window.open so no real popup is attempted; this helper just dispatches the message directly as if the popup
// had already sent it.
function fireCallbackMessage(payload: { code: string | null; stateToken: string | null }) {
  const event = new MessageEvent('message', {
    origin: window.location.origin,
    data: { type: FACEBOOK_CALLBACK_MESSAGE_TYPE, ...payload },
  })
  window.dispatchEvent(event)
}

// A stand-in for a real popup window, enough to let the component navigate it (`.location.href = …`), close it,
// and read `.closed`. Each test uses a fresh instance so assertions on the href don't leak between tests.
function fakePopup(): Window & { navigatedTo: string[]; close: ReturnType<typeof vi.fn>; closed: boolean } {
  const navigatedTo: string[] = []
  const popup = {
    closed: false,
    close: vi.fn(() => {
      ;(popup as unknown as { closed: boolean }).closed = true
    }),
    navigatedTo,
    location: {
      get href() {
        return navigatedTo.at(-1) ?? 'about:blank'
      },
      set href(value: string) {
        navigatedTo.push(value)
      },
    },
  }
  return popup as unknown as Window & { navigatedTo: string[]; close: ReturnType<typeof vi.fn>; closed: boolean }
}

beforeEach(() => {
  sessionStorage.clear()
  loadSession()
  startSession(makeJwt())
})

afterEach(() => vi.restoreAllMocks())

describe('Log in with Facebook button visibility', () => {
  it('is hidden when the server reports Facebook login isn’t configured', async () => {
    mockConnection(false)
    mockEmptyPages()
    renderApp('/t/settings/meta')
    expect(await screen.findByRole('heading', { level: 1, name: 'Meta' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Log in with Facebook' })).not.toBeInTheDocument()
    // The manual Add card from OW-10 stays visible as a fallback.
    expect(await screen.findByRole('region', { name: 'Add a Facebook page' })).toBeInTheDocument()
  })

  it('is shown when the server reports Facebook login is configured', async () => {
    mockConnection(true)
    mockEmptyPages()
    renderApp('/t/settings/meta')
    expect(await screen.findByRole('region', { name: 'Log in with Facebook' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Log in with Facebook' })).toBeInTheDocument()
  })
})

describe('Log in with Facebook flow', () => {
  beforeEach(() => {
    mockConnection(true)
    mockEmptyPages()
  })

  async function startLogin(popup = fakePopup()) {
    renderApp('/t/settings/meta')
    const button = await screen.findByRole('button', { name: 'Log in with Facebook' })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => popup)
    await userEvent.click(button)
    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    return { openSpy, popup }
  }

  it('opens the popup synchronously as about:blank and only navigates it to the authorize URL once the request resolves', async () => {
    // Browsers only honour window.open on the transient user-activation window of a click handler. The authorize
    // fetch takes long enough (anything over Chrome's ~1 second activation ping, Safari's "any await at all") that
    // calling window.open after an await is silently blocked. The flow must open about:blank synchronously and
    // navigate it afterwards.
    mockAuthorize(() =>
      HttpResponse.json({
        data: { authorize_url: 'https://www.facebook.com/v20.0/dialog/oauth?x=1', state_token: 'tok-123' },
        success: true,
      }),
    )
    const { openSpy, popup } = await startLogin()
    expect(openSpy).toHaveBeenCalledWith('about:blank', expect.any(String), expect.stringContaining('width='))
    await waitFor(() =>
      expect(popup.navigatedTo).toContain('https://www.facebook.com/v20.0/dialog/oauth?x=1'),
    )
  })

  it('closes the pre-opened popup when the authorize request fails, so the admin doesn’t stare at about:blank', async () => {
    mockAuthorize(() => envelope(502, 'Meta service is temporarily unavailable'))
    const { popup } = await startLogin()
    await waitFor(() => expect(popup.close).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(META_UNREACHABLE_MESSAGE)
  })

  it('tells the admin the popup was blocked and skips the authorize request entirely', async () => {
    // A popup blocker, an extension, or an embedded webview that refuses window.open returns null. The flow must
    // detect this and show the popup-blocked message — otherwise the authorize request would succeed and mint a
    // state_token with nowhere to be delivered, and the button would silently return to idle.
    const authorizeCalls: string[] = []
    server.use(
      http.get('*/operator/api/facebook_login/authorize_url', ({ request }) => {
        authorizeCalls.push(request.url)
        return HttpResponse.json({
          data: { authorize_url: 'https://fb.test/dialog', state_token: 'tok-123' },
          success: true,
        })
      }),
    )
    renderApp('/t/settings/meta')
    const button = await screen.findByRole('button', { name: 'Log in with Facebook' })
    vi.spyOn(window, 'open').mockImplementation(() => null)
    await userEvent.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent(FACEBOOK_POPUP_BLOCKED_MESSAGE)
    expect(authorizeCalls).toEqual([])
    // Button stays enabled so a retry (after the admin allows popups) just works.
    expect(screen.getByRole('button', { name: 'Log in with Facebook' })).toBeEnabled()
  })

  it('exchanges the callback code for the Pages list and lets the admin pick one', async () => {
    mockAuthorize(() =>
      HttpResponse.json({
        data: { authorize_url: 'https://fb.test/dialog', state_token: 'tok-123' },
        success: true,
      }),
    )
    const exchangeBodies = mockFbPages(() =>
      HttpResponse.json({
        data: {
          session_id: 'sess_abc',
          pages: [
            { id: '12345', name: 'Main Page', access_token_present: true },
            { id: '67890', name: 'No Token Page', access_token_present: false },
          ],
        },
        success: true,
      }),
    )
    let callCount = 0
    server.use(
      http.get('*/operator/api/meta_credentials', () => {
        callCount += 1
        if (callCount === 1) return HttpResponse.json({ data: [], success: true })
        return HttpResponse.json({
          data: [{ id: 7, label: 'Main Page', page_id: '12345', ad_account_id: null }],
          success: true,
        })
      }),
    )
    const connectBodies = mockFbCredentials(() =>
      HttpResponse.json({
        data: { id: 7, label: 'Main Page', page_id: '12345', ad_account_id: null },
        success: true,
      }),
    )

    await startLogin()
    fireCallbackMessage({ code: 'oauth-code', stateToken: 'tok-123' })

    expect(await screen.findByText('Main Page')).toBeInTheDocument()
    expect(screen.getByText('No Token Page')).toBeInTheDocument()
    expect(exchangeBodies).toEqual([
      { code: 'oauth-code', redirect_uri: `${window.location.origin}/meta/facebook/callback`, state_token: 'tok-123' },
    ])

    // The No-Token row's Connect button is disabled: the backend wouldn't give us a Page token for that one.
    const connectButtons = screen.getAllByRole('button', { name: /^Connect this page$/ })
    expect(connectButtons[0]).toBeEnabled()
    expect(connectButtons[1]).toBeDisabled()

    await userEvent.click(connectButtons[0])
    await waitFor(() => expect(connectBodies).toHaveLength(1))
    expect(connectBodies[0]).toEqual({ session_id: 'sess_abc', page_id: '12345', label: 'Main Page' })
    expect(await screen.findByText('Connected Main Page.')).toBeInTheDocument()
    // The pages list on the main card refetched; new page is there.
    const metaPages = await screen.findAllByText('Facebook page 12345')
    expect(metaPages.length).toBeGreaterThan(0)
  })

  it('ignores a callback message with a mismatched state token (postMessage security)', async () => {
    mockAuthorize(() =>
      HttpResponse.json({ data: { authorize_url: 'https://fb.test/dialog', state_token: 'tok-123' }, success: true }),
    )
    const exchangeBodies = mockFbPages(() => HttpResponse.json({ data: { session_id: 'x', pages: [] }, success: true }))

    await startLogin()
    fireCallbackMessage({ code: 'oauth-code', stateToken: 'ATTACKER' })

    // Give any state updates a chance to flush; nothing should have changed.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(exchangeBodies).toEqual([])
  })

  it('shows the cancelled copy when the callback returns without a code', async () => {
    mockAuthorize(() =>
      HttpResponse.json({ data: { authorize_url: 'https://fb.test/dialog', state_token: 'tok-123' }, success: true }),
    )
    await startLogin()
    fireCallbackMessage({ code: null, stateToken: 'tok-123' })

    expect(
      await screen.findByText('Facebook login was cancelled, so nothing was connected.'),
    ).toBeInTheDocument()
    // Button is still available to try again.
    expect(screen.getByRole('button', { name: 'Log in with Facebook' })).toBeEnabled()
  })

  it("shows Meta's rejection as the server message when it rejects the Page's token", async () => {
    mockAuthorize(() =>
      HttpResponse.json({ data: { authorize_url: 'https://fb.test/dialog', state_token: 'tok-123' }, success: true }),
    )
    mockFbPages(() =>
      HttpResponse.json({
        data: { session_id: 'sess_abc', pages: [{ id: '12345', name: 'Main', access_token_present: true }] },
        success: true,
      }),
    )
    mockFbCredentials(() => envelope(422, "Meta rejected this Page's access token as invalid or expired"))

    await startLogin()
    fireCallbackMessage({ code: 'oauth-code', stateToken: 'tok-123' })
    await screen.findByText('Main')
    await userEvent.click(screen.getByRole('button', { name: 'Connect this page' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Meta rejected this Page's access token as invalid or expired",
    )
    // Pages list stays so the admin can try another one or cancel.
    expect(screen.getByText('Main')).toBeInTheDocument()
  })

  it('surfaces an expired session_id and lets the admin start over', async () => {
    mockAuthorize(() =>
      HttpResponse.json({ data: { authorize_url: 'https://fb.test/dialog', state_token: 'tok-123' }, success: true }),
    )
    mockFbPages(() =>
      HttpResponse.json({
        data: { session_id: 'sess_abc', pages: [{ id: '12345', name: 'Main', access_token_present: true }] },
        success: true,
      }),
    )
    mockFbCredentials(() => envelope(410, 'Your Facebook login has expired. Please log in again.'))

    await startLogin()
    fireCallbackMessage({ code: 'oauth-code', stateToken: 'tok-123' })
    await screen.findByText('Main')
    await userEvent.click(screen.getByRole('button', { name: 'Connect this page' }))

    expect(await screen.findByText(FACEBOOK_SESSION_EXPIRED_MESSAGE)).toBeInTheDocument()
    // Picker drops out; the admin sees the Log in with Facebook button again.
    const retryButton = await screen.findByRole('button', { name: 'Log in with Facebook' })
    expect(screen.queryByText('Main')).not.toBeInTheDocument()

    // Clicking the retry button must NOT re-expose the stale picker. Without the state-clear fix in startLogin,
    // resetting the mutation errors made showPages (pages !== null && !sessionExpired) flip back to true and the
    // picker rendered a Connect button that would POST to the already-consumed session_id, producing another 410.
    vi.spyOn(window, 'open').mockImplementation(() => fakePopup())
    await userEvent.click(retryButton)
    // The expired message is cleared and the stale page row stays gone.
    expect(screen.queryByText(FACEBOOK_SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument()
    expect(screen.queryByText('Main')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect this page' })).not.toBeInTheDocument()
  })

  it("shows Meta's unreachable copy when the Meta service is failing (502) and closes the popup", async () => {
    mockAuthorize(() => envelope(502, 'Meta service is temporarily unavailable'))
    const { popup } = await startLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent(META_UNREACHABLE_MESSAGE)
    await waitFor(() => expect(popup.close).toHaveBeenCalled())
  })

  it('shows the standard unreachable message on a gateway outage and closes the popup', async () => {
    mockAuthorize(() => HttpResponse.error())
    const { popup } = await startLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    await waitFor(() => expect(popup.close).toHaveBeenCalled())
  })

  it('shows a no-Pages message when the Facebook account manages none', async () => {
    mockAuthorize(() =>
      HttpResponse.json({ data: { authorize_url: 'https://fb.test/dialog', state_token: 'tok-123' }, success: true }),
    )
    mockFbPages(() => HttpResponse.json({ data: { session_id: 'sess_abc', pages: [] }, success: true }))

    await startLogin()
    fireCallbackMessage({ code: 'oauth-code', stateToken: 'tok-123' })

    expect(
      await screen.findByText("This Facebook account doesn’t manage any Pages, so there’s nothing to connect."),
    ).toBeInTheDocument()
  })
})
