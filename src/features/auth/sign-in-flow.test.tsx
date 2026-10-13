import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '@/lib/api/client'
import { currentSession, loadSession } from '@/lib/session/session'
import { SESSION_STORAGE_KEY } from '@/lib/session/storage'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { NOT_ALLOWED_MESSAGE, UNREACHABLE_MESSAGE, WRONG_CREDENTIALS_MESSAGE } from './session-actions'

function signedInAs(claims: Record<string, unknown> = {}) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, makeJwt(claims))
  loadSession()
}

function loginReturns(jwt: string) {
  server.use(http.post('*/auth/api/login', () => HttpResponse.json({ jwt, success: true })))
}

async function fillAndSubmit(email = 'asha@example.com', password = 'correct horse') {
  await userEvent.type(await screen.findByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname
const search = (router: ReturnType<typeof renderApp>) => router.state.location.search as Record<string, unknown>

describe('signing in', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('sends "/" to the login page when signed out', async () => {
    const router = renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(path(router)).toBe('/login')
  })

  it('signs an admin in and lands them in the tenant area', async () => {
    loginReturns(makeJwt())
    const router = renderApp('/login')
    await fillAndSubmit()
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha' })).toBeInTheDocument()
    expect(path(router)).toBe('/t')
    expect(screen.getByText('Organisation')).toBeInTheDocument()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull()
  })

  it('lands a super admin in the admin area', async () => {
    loginReturns(makeJwt({ role_name: 'super_admin', role_display_name: 'Super Admin', tenant_id: null }))
    const router = renderApp('/login')
    await fillAndSubmit()
    expect(await screen.findByText('Super Admin')).toBeInTheDocument()
    expect(path(router)).toBe('/admin')
  })

  it('returns to the page that was asked for', async () => {
    const router = renderApp('/admin')
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(path(router)).toBe('/login')
    expect(search(router).redirect).toBe('/admin')

    loginReturns(makeJwt({ role_name: 'super_admin' }))
    await fillAndSubmit()
    await waitFor(() => expect(path(router)).toBe('/admin'))
  })

  it('ignores a redirect to another site', async () => {
    loginReturns(makeJwt())
    const router = renderApp('/login?redirect=https%3A%2F%2Fevil.example%2F')
    await fillAndSubmit()
    await waitFor(() => expect(path(router)).toBe('/t'))
  })

  it('explains wrong credentials, keeps the email and clears the password', async () => {
    server.use(
      http.post('*/auth/api/login', () =>
        HttpResponse.json({ error: { message: 'Invalid Email or Password', status: 401 } }, { status: 401 }),
      ),
    )
    const router = renderApp('/login')
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(WRONG_CREDENTIALS_MESSAGE)
    expect(screen.getByLabelText('Email')).toHaveValue('asha@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(path(router)).toBe('/login')
  })

  it("shows the server's reason when the organisation is suspended", async () => {
    server.use(
      http.post('*/auth/api/login', () =>
        HttpResponse.json({ error: { message: 'This organisation has been suspended', status: 403 } }, { status: 403 }),
      ),
    )
    renderApp('/login')
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('This organisation has been suspended')
  })

  it('turns away a role that cannot use the panel and signs its token out', async () => {
    const consumerJwt = makeJwt({ role_name: 'user' })
    loginReturns(consumerJwt)
    let signedOut: string | null = null
    server.use(
      http.post('*/auth/api/logout', ({ request }) => {
        signedOut = request.headers.get('X-Jwt-Token')
        return HttpResponse.json({ data: { message: 'Logged out successfully' }, success: true })
      }),
    )
    const router = renderApp('/login')
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_ALLOWED_MESSAGE)
    expect(signedOut).toBe(consumerJwt)
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(path(router)).toBe('/login')
  })

  it('says when the server is unreachable', async () => {
    server.use(http.post('*/auth/api/login', () => HttpResponse.error()))
    renderApp('/login')
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE_MESSAGE)
  })

  it('disables the form while signing in', async () => {
    server.use(
      http.post('*/auth/api/login', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    renderApp('/login')
    await fillAndSubmit()
    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
    expect(screen.getByLabelText('Email')).toBeDisabled()
  })

  it('links to password reset and signup', async () => {
    renderApp('/login')
    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/password/forgot')
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup')
  })

  it('tells the user to sign in after a successful password reset', async () => {
    renderApp('/login?reason=password-updated')
    expect(await screen.findByText('Password updated. Sign in with your new password.')).toBeInTheDocument()
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument()
  })

  it('ignores an unknown reason', async () => {
    renderApp('/login?reason=something-else')
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Password updated/)).not.toBeInTheDocument()
  })
})

describe('signed-in navigation', () => {
  beforeEach(() => sessionStorage.clear())

  it('skips the login page when already signed in', async () => {
    signedInAs()
    const router = renderApp('/login')
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha' })).toBeInTheDocument()
    expect(path(router)).toBe('/t')
  })

  it.each([
    ['admin', '/admin', '/t'],
    ['super_admin', '/t', '/admin'],
  ])('keeps a %s out of the other area', async (role, from, to) => {
    signedInAs({ role_name: role })
    const router = renderApp(from)
    await waitFor(() => expect(path(router)).toBe(to))
  })

  it('restores the session after a reload', async () => {
    signedInAs()
    renderApp('/t')
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha' })).toBeInTheDocument()
  })

  it('sends an expired session to the login page, then back after signing in', async () => {
    signedInAs({ expires_at: Math.floor(Date.now() / 1000) - 60 })
    const router = renderApp('/t')
    expect(await screen.findByText('Your session has expired. Sign in again to continue.')).toBeInTheDocument()
    expect(search(router)).toMatchObject({ redirect: '/t', reason: 'expired' })

    loginReturns(makeJwt())
    await fillAndSubmit()
    await waitFor(() => expect(path(router)).toBe('/t'))
  })

  it('returns to login when the server rejects the session mid-visit', async () => {
    signedInAs()
    const router = renderApp('/t')
    await screen.findByRole('heading', { name: 'Welcome, Asha' })

    server.use(http.get('*/auth/api/me', () => HttpResponse.json({}, { status: 401 })))
    await act(() => api.GET('/auth/api/me'))

    expect(await screen.findByText('Your session has expired. Sign in again to continue.')).toBeInTheDocument()
    expect(path(router)).toBe('/login')
    expect(search(router)).toMatchObject({ redirect: '/t', reason: 'expired' })
  })

  it('clears the session before the slow logout request finishes', async () => {
    signedInAs()
    const token = sessionStorage.getItem(SESSION_STORAGE_KEY)
    let seen: { token: string | null; storedWhenSent: string | null; keepalive: boolean } | undefined
    server.use(
      http.post('*/auth/api/logout', async ({ request }) => {
        seen = {
          token: request.headers.get('X-Jwt-Token'),
          storedWhenSent: sessionStorage.getItem(SESSION_STORAGE_KEY),
          keepalive: request.keepalive,
        }
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    renderApp('/t')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    // A reload now must not restore the session, even though the server hasn't answered.
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    await waitFor(() => expect(seen).toBeDefined())
    expect(seen).toEqual({ token, storedWhenSent: null, keepalive: true })
  })

  it.each([
    ['succeeds', () => HttpResponse.json({ data: { message: 'Logged out successfully' }, success: true })],
    ['fails', () => HttpResponse.json({}, { status: 500 })],
    ['cannot be reached', () => HttpResponse.error()],
  ])('signs out when the server call %s', async (_label, resolver) => {
    signedInAs()
    let called = false
    server.use(
      http.post('*/auth/api/logout', () => {
        called = true
        return resolver()
      }),
    )
    const router = renderApp('/t')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(called).toBe(true)
    expect(currentSession()).toBeNull()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(search(router)).toEqual({})
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument()
  })
})
