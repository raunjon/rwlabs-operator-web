import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { currentSession, loadSession } from '@/lib/session/session'
import { SESSION_STORAGE_KEY } from '@/lib/session/storage'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { INVITATION_INVALID_MESSAGE } from './invitation'
import { CREATED_NOT_SIGNED_IN_MESSAGE, NOT_ALLOWED_MESSAGE, UNREACHABLE_MESSAGE } from './session-actions'

const EXPIRES = Date.UTC(2030, 2, 17, 12, 0, 0) / 1000
const invite = { email: 'new@example.com', role: 'lead_manager', tenant_name: 'Acme Events', expires_at: EXPIRES }
const notFound = () =>
  HttpResponse.json({ error: { message: 'Invitation not found or no longer valid', status: 404 }, success: false }, { status: 404 })
const refused = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })
const accepted = () =>
  HttpResponse.json({ data: { token: 'raw-auth-token', role_name: 'admin' }, success: true }, { status: 201 })

function lookupReturns(respond: () => Response | Promise<Response> = () => HttpResponse.json({ data: invite, success: true })) {
  const tokens: (string | null)[] = []
  server.use(
    http.get('*/auth/api/invitations/lookup', ({ request }) => {
      tokens.push(new URL(request.url).searchParams.get('token'))
      return respond()
    }),
  )
  return tokens
}

function acceptAnswers(respond: () => Response | Promise<Response>) {
  const bodies: unknown[] = []
  server.use(
    http.post('*/auth/api/invitations/accept', async ({ request }) => {
      bodies.push(await request.json())
      return respond()
    }),
  )
  return bodies
}

function loginReturns(jwt: string) {
  server.use(http.post('*/auth/api/login', () => HttpResponse.json({ jwt, success: true })))
}

async function fillForm(overrides: Partial<Record<'First name' | 'Last name' | 'Password' | 'Confirm password', string>> = {}) {
  const values = { 'First name': 'Ira', 'Last name': 'S', Password: 'password123', 'Confirm password': 'password123', ...overrides }
  for (const [label, value] of Object.entries(values)) {
    if (value) await userEvent.type(screen.getByLabelText(label), value)
  }
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Create account' }))
const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname
const PAGE = '/invitations/accept?token=abc'

describe('accepting an invitation', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('shows who the invitation is for while the form waits to be filled', async () => {
    const tokens = lookupReturns()
    renderApp(PAGE)
    expect(await screen.findByRole('heading', { name: 'Join Acme Events' })).toBeInTheDocument()
    expect(tokens).toEqual(['abc'])
    expect(screen.getByText('new@example.com')).toBeInTheDocument()
    expect(screen.getByText('Lead manager')).toBeInTheDocument()
    expect(screen.getByText(/expires/i)).toHaveTextContent('2030')
    // The email is the invitation's, not editable.
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters')
  })

  it('creates the account and lands the invitee in their area, signed in', async () => {
    lookupReturns()
    const bodies = acceptAnswers(accepted)
    const jwt = makeJwt({ first_name: 'Ira', email: 'new@example.com', tenant_id: 9 })
    loginReturns(jwt)
    const router = renderApp(PAGE)
    await screen.findByRole('heading', { name: 'Join Acme Events' })

    await fillForm()
    await submit()

    expect(await screen.findByRole('heading', { name: 'Welcome, Ira' })).toBeInTheDocument()
    expect(path(router)).toBe('/t')
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(jwt)
    expect(bodies).toEqual([{ token: 'abc', first_name: 'Ira', last_name: 'S', password: 'password123' }])
  })

  it('checks the fields before sending anything', async () => {
    lookupReturns()
    const bodies = acceptAnswers(accepted)
    renderApp(PAGE)
    await screen.findByRole('heading', { name: 'Join Acme Events' })
    await fillForm({ 'First name': '', Password: 'short', 'Confirm password': 'other' })
    await submit()

    for (const [label, message] of [
      ['First name', 'Enter your first name'],
      ['Password', 'Use at least 8 characters'],
      ['Confirm password', 'The passwords don’t match'],
    ] as const) {
      const input = await screen.findByLabelText(label)
      expect(input, label).toHaveAttribute('aria-invalid', 'true')
      expect(input, label).toHaveAccessibleDescription(expect.stringContaining(message))
    }
    expect(bodies).toEqual([])
  })

  it.each([
    ['a link that is unknown, used or expired', PAGE, notFound],
    ['a link without a token', '/invitations/accept', undefined],
  ])('explains %s and offers sign-in', async (_label, url, respond) => {
    const tokens = respond ? lookupReturns(respond) : []
    renderApp(url)
    expect(await screen.findByRole('alert')).toHaveTextContent(INVITATION_INVALID_MESSAGE)
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(tokens.length).toBeLessThanOrEqual(1)
  })

  it('shows an outage with a retry that recovers', async () => {
    let attempts = 0
    lookupReturns(() => (++attempts < 2 ? HttpResponse.error() : HttpResponse.json({ data: invite, success: true })))
    renderApp(PAGE)
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE_MESSAGE)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Join Acme Events' })).toBeInTheDocument()
  })

  it('switches to the invalid state when the link stops working between lookup and accept', async () => {
    lookupReturns()
    acceptAnswers(notFound)
    renderApp(PAGE)
    await screen.findByRole('heading', { name: 'Join Acme Events' })
    await fillForm()
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(INVITATION_INVALID_MESSAGE)
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
  })

  it('offers sign-in when the email already has an account', async () => {
    lookupReturns()
    acceptAnswers(() => refused(409, 'An account with this email already exists'))
    renderApp(PAGE)
    await screen.findByRole('heading', { name: 'Join Acme Events' })
    await fillForm()
    await submit()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('An account with this email already exists')
    expect(within(alert).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it("shows the server's validation message at form level", async () => {
    lookupReturns()
    acceptAnswers(() => refused(422, 'Password is too short (minimum is 8 characters)'))
    renderApp(PAGE)
    await screen.findByRole('heading', { name: 'Join Acme Events' })
    await fillForm()
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Password is too short (minimum is 8 characters)')
  })

  it('explains a role the panel does not support yet, after creating the account', async () => {
    lookupReturns()
    acceptAnswers(accepted)
    loginReturns(makeJwt({ role_name: 'lead_manager' }))
    server.use(http.post('*/auth/api/logout', () => HttpResponse.json({ data: { message: 'ok' }, success: true })))
    const router = renderApp(PAGE)
    await screen.findByRole('heading', { name: 'Join Acme Events' })
    await fillForm()
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_ALLOWED_MESSAGE)
    expect(path(router)).toBe('/invitations/accept')
    expect(currentSession()).toBeNull()
  })

  it('points to sign-in when the account was created but signing in failed', async () => {
    lookupReturns()
    acceptAnswers(accepted)
    server.use(http.post('*/auth/api/login', () => HttpResponse.error()))
    renderApp(PAGE)
    await screen.findByRole('heading', { name: 'Join Acme Events' })
    await fillForm()
    await submit()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(CREATED_NOT_SIGNED_IN_MESSAGE)
    expect(within(alert).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('disables the form while the account is being created', async () => {
    lookupReturns()
    acceptAnswers(async () => {
      await delay('infinite')
      return accepted()
    })
    renderApp(PAGE)
    await screen.findByRole('heading', { name: 'Join Acme Events' })
    await fillForm()
    await submit()
    expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled()
    expect(screen.getByLabelText('First name')).toBeDisabled()
  })

  it('asks a signed-in user to sign out first, then shows the form', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, makeJwt({ email: 'asha@example.com' }))
    loadSession()
    lookupReturns()
    let loggedOut = false
    server.use(
      http.post('*/auth/api/logout', () => {
        loggedOut = true
        return HttpResponse.json({ data: { message: 'ok' }, success: true })
      }),
    )
    const router = renderApp(PAGE)
    await screen.findByRole('heading', { name: 'Join Acme Events' })
    expect(screen.getByRole('status')).toHaveTextContent('asha@example.com')
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sign out and continue' }))

    expect(await screen.findByRole('button', { name: 'Create account' })).toBeInTheDocument()
    await waitFor(() => expect(loggedOut).toBe(true))
    expect(currentSession()).toBeNull()
    expect(path(router)).toBe('/invitations/accept')
  })
})
