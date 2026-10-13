import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { currentSession, loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'

const EXPIRES = Date.UTC(2030, 2, 17, 12, 0, 0) / 1000
const invitation = (email: string, role: string, token: string | undefined = `token-for-${email}`) => ({
  id: 12,
  tenant_id: 3,
  email,
  role,
  expires_at: EXPIRES,
  ...(token ? { accept_token: token } : {}),
})
const refused = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

function createAnswers(respond: (body: { email: string; role: string }) => Response | Promise<Response>) {
  const bodies: unknown[] = []
  server.use(
    http.post('*/auth/api/invitations', async ({ request }) => {
      const body = (await request.json()) as { email: string; role: string }
      bodies.push(body)
      return respond(body)
    }),
  )
  return bodies
}
const createsInvitation = () =>
  createAnswers(({ email, role }) => HttpResponse.json({ data: invitation(email, role), success: true }))

const card = () => screen.findByRole('region', { name: 'Invite a team member' })
const linkValue = () => (screen.getByRole('textbox', { name: 'Accept link' }) as HTMLInputElement).value
const send = () => userEvent.click(screen.getByRole('button', { name: 'Send invite' }))

async function invite(email: string, role?: string) {
  const region = within(await card())
  await userEvent.clear(region.getByLabelText('Email'))
  if (email) await userEvent.type(region.getByLabelText('Email'), email)
  if (role) await userEvent.selectOptions(region.getByLabelText('Role'), role)
  await send()
}

describe('finding the invite card', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
  })

  it('is on the Team page, reached from the sidebar, not on the home page', async () => {
    const router = renderApp('/t')
    expect(await screen.findByRole('heading', { name: /welcome/i })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Invite a team member' })).not.toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Team' }))
    expect(await card()).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Team' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/t/team')
  })
})

describe('inviting a team member from the Team page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
  })
  afterEach(() => vi.restoreAllMocks())

  it('sends the invite and shows its accept link, built from the page’s origin', async () => {
    const bodies = createsInvitation()
    renderApp('/t/team')
    await invite('New@Example.com ', 'Event manager')

    const result = await screen.findByRole('status', { name: 'Invitation created' })
    expect(bodies).toEqual([{ email: 'New@Example.com', role: 'event_manager' }])
    expect(within(result).getByText('New@Example.com')).toBeInTheDocument()
    expect(within(result).getByText('Event manager')).toBeInTheDocument()
    expect(within(result).getByText(/expires/i)).toHaveTextContent('2030')
    expect(within(result).getByRole('textbox', { name: 'Accept link' })).toHaveValue(
      `${window.location.origin}/invitations/accept?token=token-for-New%40Example.com`,
    )
  })

  it('defaults the role to admin, the role that can use this panel', async () => {
    const bodies = createsInvitation()
    renderApp('/t/team')
    const region = within(await card())
    expect(region.getByLabelText('Role')).toHaveValue('admin')
    expect(region.getByLabelText('Role')).toHaveAccessibleDescription(/event and lead managers can’t use this panel yet/i)
    await invite('a@example.com')
    await screen.findByRole('status', { name: 'Invitation created' })
    expect(bodies).toEqual([{ email: 'a@example.com', role: 'admin' }])
  })

  it('copies the link and says so', async () => {
    createsInvitation()
    const user = userEvent.setup()
    renderApp('/t/team')
    await invite('a@example.com')
    await screen.findByRole('status', { name: 'Invitation created' })

    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    await expect(navigator.clipboard.readText()).resolves.toBe(
      `${window.location.origin}/invitations/accept?token=token-for-a%40example.com`,
    )
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
  })

  it('says when the link couldn’t be copied, so it can be copied by hand', async () => {
    createsInvitation()
    const user = userEvent.setup()
    renderApp('/t/team')
    await invite('a@example.com')
    await screen.findByRole('status', { name: 'Invitation created' })
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))

    await user.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByText('Couldn’t copy. Select the link and copy it.')).toBeInTheDocument()
  })

  it('clears the form for the next invite and keeps the last link until that one is sent', async () => {
    createsInvitation()
    renderApp('/t/team')
    await invite('first@example.com', 'Lead manager')
    await screen.findByRole('status', { name: 'Invitation created' })

    const region = within(await card())
    expect(region.getByLabelText('Email')).toHaveValue('')
    expect(region.getByLabelText('Role')).toHaveValue('admin')
    expect(linkValue()).toContain('token-for-first%40example.com')

    await invite('second@example.com')
    await waitFor(() => expect(linkValue()).toContain('token-for-second%40example.com'))
    expect(screen.queryByText('first@example.com')).not.toBeInTheDocument()
  })

  it('checks the email in the browser before sending', async () => {
    const bodies = createsInvitation()
    renderApp('/t/team')
    await invite('')
    expect(await screen.findByText('Enter their email')).toBeInTheDocument()
    await invite('not-an-email')
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(within(await card()).getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email address')
    expect(bodies).toEqual([])
  })

  it.each([
    [409, 'Email already belongs to an account'],
    [409, 'Email already has a pending invitation'],
    [422, 'Email is invalid'],
  ])('shows the server’s message for a %i and keeps what was typed', async (status, message) => {
    createAnswers(() => refused(status, message))
    renderApp('/t/team')
    await invite('taken@example.com', 'Lead manager')
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    const region = within(await card())
    expect(region.getByLabelText('Email')).toHaveValue('taken@example.com')
    expect(region.getByLabelText('Role')).toHaveValue('lead_manager')
    expect(screen.queryByRole('status', { name: 'Invitation created' })).not.toBeInTheDocument()
  })

  it('says when the user isn’t allowed to invite', async () => {
    createAnswers(() => refused(403, 'You are not authorized to perform this action'))
    renderApp('/t/team')
    await invite('a@example.com')
    expect(await screen.findByRole('alert')).toHaveTextContent('You don’t have access to this')
  })

  it.each([
    ['the network fails', () => HttpResponse.error()],
    ['a proxy answers with an HTML error page', () => HttpResponse.html('<h1>502 Bad Gateway</h1>', { status: 502 })],
  ])('says the server is unreachable when %s', async (_, respond) => {
    createAnswers(respond)
    renderApp('/t/team')
    await invite('a@example.com')
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE_MESSAGE)
    expect(screen.queryByText(/502/)).not.toBeInTheDocument()
  })

  it('disables the form while the invite is being sent', async () => {
    createAnswers(async () => {
      await delay('infinite')
      return HttpResponse.json({})
    })
    renderApp('/t/team')
    await invite('a@example.com')
    const region = within(await card())
    expect(region.getByRole('button', { name: 'Sending invite…' })).toBeDisabled()
    expect(region.getByLabelText('Email')).toBeDisabled()
    expect(region.getByLabelText('Role')).toBeDisabled()
  })

  it('ends the session when the gateway rejects the JWT', async () => {
    createAnswers(() => refused(401, 'Session expired, please login again'))
    const router = renderApp('/t/team')
    await invite('a@example.com')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(currentSession()).toBeNull()
  })

  it('still confirms the invite when the server sends no link, and says the link is missing', async () => {
    createAnswers(({ email, role }) => HttpResponse.json({ data: invitation(email, role, ''), success: true }))
    renderApp('/t/team')
    await invite('a@example.com')
    const result = await screen.findByRole('status', { name: 'Invitation created' })
    expect(within(result).getByText('a@example.com')).toBeInTheDocument()
    expect(within(result).getByText(/the server didn’t send the accept link/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Accept link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
  })
})
