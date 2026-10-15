import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '@/router'
import { FACEBOOK_CALLBACK_MESSAGE_TYPE } from './facebook-login'

// Mounts the whole app router (so the real /meta/facebook/callback route resolves) under StrictMode, which is what
// the production build uses. The point of this test file: the callback effect must not fire twice when StrictMode
// double-mounts, otherwise the opener runs two /facebook_login/pages exchanges and the second lands on 410 because
// the state_token is one-shot server-side.
function renderCallbackUnderStrictMode(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [initialPath] }))
  return render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
}

const openerPostMessage = vi.fn()
const closeSpy = vi.fn()

beforeEach(() => {
  openerPostMessage.mockClear()
  closeSpy.mockClear()
  Object.defineProperty(window, 'opener', { configurable: true, value: { postMessage: openerPostMessage } })
  Object.defineProperty(window, 'close', { configurable: true, value: closeSpy })
})

afterEach(() => {
  Object.defineProperty(window, 'opener', { configurable: true, value: null })
})

async function flushEffects() {
  // StrictMode's double-invoke runs the second effect synchronously after the first unmount; a microtask flush is
  // enough to catch both.
  await Promise.resolve()
  await Promise.resolve()
}

describe('FacebookCallbackPage', () => {
  it('posts code + stateToken to the opener and closes itself only once under StrictMode', async () => {
    const { findByText } = renderCallbackUnderStrictMode('/meta/facebook/callback?code=oauth-code&state=tok-123')
    // Wait for the component to actually mount (router navigation is async).
    await findByText('Finishing Facebook login…')
    await flushEffects()

    expect(openerPostMessage).toHaveBeenCalledTimes(1)
    expect(openerPostMessage).toHaveBeenCalledWith(
      { type: FACEBOOK_CALLBACK_MESSAGE_TYPE, code: 'oauth-code', stateToken: 'tok-123' },
      window.location.origin,
    )
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it('posts code: null when Facebook returned error=access_denied (user cancelled)', async () => {
    const { findByText } = renderCallbackUnderStrictMode('/meta/facebook/callback?error=access_denied&state=tok-123')
    await findByText('Finishing Facebook login…')
    await flushEffects()
    expect(openerPostMessage).toHaveBeenCalledWith(
      { type: FACEBOOK_CALLBACK_MESSAGE_TYPE, code: null, stateToken: 'tok-123' },
      window.location.origin,
    )
  })

  it('shows the direct-visitor fallback copy and does not postMessage when there is no opener', async () => {
    Object.defineProperty(window, 'opener', { configurable: true, value: null })
    const { findByText } = renderCallbackUnderStrictMode('/meta/facebook/callback?code=oauth-code&state=tok-123')
    expect(await findByText('This page is used by Facebook login. You can close it.')).toBeInTheDocument()
    expect(openerPostMessage).not.toHaveBeenCalled()
  })
})
