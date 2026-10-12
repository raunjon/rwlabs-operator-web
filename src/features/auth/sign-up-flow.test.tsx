import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSession } from '@/lib/session/session'
import { SESSION_STORAGE_KEY } from '@/lib/session/storage'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { CREATED_NOT_SIGNED_IN_MESSAGE, UNREACHABLE_MESSAGE } from './session-actions'

const EMAIL_TAKEN = 'An account with this email already exists'
const NAME_IN_USE = 'Another signup is using this organisation name right now, please try again'

const created = () =>
  HttpResponse.json({ data: { token: 'raw-auth-token', role_name: 'admin' }, success: true }, { status: 201 })

const refused = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

// Records the signup bodies the gateway receives, answering with `respond`.
function signupAnswers(respond: () => Response | Promise<Response>) {
  const bodies: unknown[] = []
  server.use(
    http.post('*/auth/api/operators/signup', async ({ request }) => {
      bodies.push(await request.json())
      return respond()
    }),
  )
  return bodies
}

function loginReturns(jwt: string) {
  server.use(http.post('*/auth/api/login', () => HttpResponse.json({ jwt, success: true })))
}

const fields = {
  'Organisation name': 'Acme Events',
  'First name': 'Ira',
  'Last name': 'S',
  Email: 'ira@example.com',
  Password: 'password123',
  'Confirm password': 'password123',
}

async function fill(overrides: Partial<Record<keyof typeof fields, string>> = {}) {
  await screen.findByRole('heading', { name: 'Create your account' })
  for (const [label, value] of Object.entries({ ...fields, ...overrides })) {
    if (value) await userEvent.type(screen.getByLabelText(label), value)
  }
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Create account' }))

const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname

describe('signing up', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('creates the organisation and lands its new admin in the tenant area, signed in', async () => {
    const bodies = signupAnswers(created)
    const jwt = makeJwt({ first_name: 'Ira', last_name: 'S', email: 'ira@example.com', tenant_id: 9 })
    loginReturns(jwt)
    const router = renderApp('/signup')

    await fill()
    await submit()

    expect(await screen.findByRole('heading', { name: 'Welcome, Ira' })).toBeInTheDocument()
    expect(path(router)).toBe('/t')
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(jwt)
    expect(bodies).toEqual([
      { tenant_name: 'Acme Events', first_name: 'Ira', last_name: 'S', email: 'ira@example.com', password: 'password123' },
    ])
  })

  it('checks every field before sending anything, and ties each message to its field', async () => {
    const bodies = signupAnswers(created)
    renderApp('/signup')
    await screen.findByRole('heading', { name: 'Create your account' })

    await submit()

    const expected: [string, string][] = [
      ['Organisation name', 'Enter your organisation’s name'],
      ['First name', 'Enter your first name'],
      ['Last name', 'Enter your last name'],
      ['Email', 'Enter your email'],
      ['Password', 'Use at least 8 characters'],
    ]
    for (const [label, message] of expected) {
      const input = await screen.findByLabelText(label)
      expect(input, label).toHaveAttribute('aria-invalid', 'true')
      expect(input, label).toHaveAccessibleDescription(expect.stringContaining(message))
    }
    expect(bodies).toEqual([])
  })

  it('asks for the password again when the confirmation differs', async () => {
    const bodies = signupAnswers(created)
    renderApp('/signup')
    await fill({ 'Confirm password': 'password124' })
    await submit()

    const confirm = screen.getByLabelText('Confirm password')
    await waitFor(() => expect(confirm).toHaveAttribute('aria-invalid', 'true'))
    expect(confirm).toHaveAccessibleDescription('The passwords don’t match')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid', 'true')
    expect(bodies).toEqual([])
  })

  it('shows the password rule before anything is typed', async () => {
    renderApp('/signup')
    expect(await screen.findByLabelText('Password')).toHaveAccessibleDescription('At least 8 characters')
  })

  it('offers to sign in when the email is taken, and that link works', async () => {
    signupAnswers(() => refused(409, EMAIL_TAKEN))
    const router = renderApp('/signup')
    await fill()
    await submit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(EMAIL_TAKEN)
    expect(path(router)).toBe('/signup')
    expect(screen.getByLabelText('Email')).toHaveValue('ira@example.com')
    // Only ways out that exist: password reset (OW-6) isn't built yet, so it isn't offered.
    const links = within(alert).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Sign in'])

    await userEvent.click(links[0])
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(path(router)).toBe('/login')
  })

  it('asks to try again when the organisation name is in use, keeping what was typed', async () => {
    signupAnswers(() => refused(409, NAME_IN_USE))
    renderApp('/signup')
    await fill()
    await submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(NAME_IN_USE)
    expect(screen.getByLabelText('Organisation name')).toHaveValue('Acme Events')
    expect(screen.getByLabelText('Password')).toHaveValue('password123')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it("shows the server's validation message at form level", async () => {
    signupAnswers(() => refused(422, 'Tenant name is too long (maximum is 100 characters)'))
    renderApp('/signup')
    await fill()
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Tenant name is too long (maximum is 100 characters)')
  })

  it('says when the server is unreachable', async () => {
    signupAnswers(() => HttpResponse.error())
    renderApp('/signup')
    await fill()
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE_MESSAGE)
  })

  it('points to sign-in when the account was created but signing in failed', async () => {
    signupAnswers(created)
    server.use(http.post('*/auth/api/login', () => HttpResponse.error()))
    const router = renderApp('/signup')
    await fill()
    await submit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(CREATED_NOT_SIGNED_IN_MESSAGE)
    expect(within(alert).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(path(router)).toBe('/signup')
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('disables the form while the account is being created', async () => {
    signupAnswers(async () => {
      await delay('infinite')
      return created()
    })
    renderApp('/signup')
    await fill()
    await submit()

    expect(await screen.findByRole('button', { name: 'Creating account…' })).toBeDisabled()
    for (const label of Object.keys(fields)) expect(screen.getByLabelText(label), label).toBeDisabled()
  })

  it('links back to sign in', async () => {
    renderApp('/signup')
    await screen.findByRole('heading', { name: 'Create your account' })
    expect(screen.getByText('Already have an account?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('skips the page when already signed in', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, makeJwt())
    loadSession()
    const router = renderApp('/signup')
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha' })).toBeInTheDocument()
    expect(path(router)).toBe('/t')
  })
})
