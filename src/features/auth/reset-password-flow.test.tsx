import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSession } from '@/lib/session/session'
import { SESSION_STORAGE_KEY } from '@/lib/session/storage'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { PASSWORD_UPDATED_MESSAGE } from './password-reset'
import { UNREACHABLE_MESSAGE } from './session-actions'

const ok = () => HttpResponse.json({ data: { message: 'Password updated' }, success: true })
const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

function resetAnswers(respond: () => Response | Promise<Response>) {
  const bodies: unknown[] = []
  server.use(
    http.post('*/auth/api/password/reset', async ({ request }) => {
      bodies.push(await request.json())
      return respond()
    }),
  )
  return bodies
}

async function fillAndSubmit(password = 'newpassword1', confirm = password) {
  await userEvent.type(await screen.findByLabelText('New password'), password)
  await userEvent.type(screen.getByLabelText('Confirm new password'), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
}

const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname
const search = (router: ReturnType<typeof renderApp>) => router.state.location.search as Record<string, unknown>

describe('resetting a password', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('posts the token and new password, then sends the user to the login page with a success flag', async () => {
    const bodies = resetAnswers(ok)
    const router = renderApp('/password/reset?token=abc123')
    await fillAndSubmit()

    await waitFor(() => expect(path(router)).toBe('/login'))
    expect(search(router)).toEqual({ reason: 'password-updated' })
    expect(bodies).toEqual([{ token: 'abc123', password: 'newpassword1' }])
    expect(await screen.findByText(PASSWORD_UPDATED_MESSAGE)).toBeInTheDocument()
  })

  it('shows the invalid state when the server rejects the token (unknown, used or expired)', async () => {
    resetAnswers(() => envelope(404, 'Reset link is invalid or has expired'))
    renderApp('/password/reset?token=stale')
    await fillAndSubmit()

    expect(await screen.findByRole('heading', { name: 'This reset link can’t be used' })).toBeInTheDocument()
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Request a new link' })
    expect(link).toHaveAttribute('href', '/password/forgot')
  })

  it('shows the invalid state straight away when the URL has no token', async () => {
    renderApp('/password/reset')
    expect(await screen.findByRole('heading', { name: 'This reset link can’t be used' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/password/forgot')
  })

  it("shows the server's validation message at form level, keeping the form", async () => {
    resetAnswers(() => envelope(422, 'Password is too weak'))
    renderApp('/password/reset?token=abc')
    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Password is too weak')
    // The form stays visible so the user can pick a stronger password.
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
  })

  it('says when the server is unreachable', async () => {
    resetAnswers(() => HttpResponse.error())
    renderApp('/password/reset?token=abc')
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE_MESSAGE)
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
  })

  it('checks the password rules before sending anything', async () => {
    const bodies = resetAnswers(ok)
    renderApp('/password/reset?token=abc')
    await userEvent.type(await screen.findByLabelText('New password'), 'short')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different')
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }))

    const password = screen.getByLabelText('New password')
    await waitFor(() => expect(password).toHaveAttribute('aria-invalid', 'true'))
    expect(password).toHaveAccessibleDescription(expect.stringContaining('Use at least 8 characters'))
    const confirm = screen.getByLabelText('Confirm new password')
    expect(confirm).toHaveAttribute('aria-invalid', 'true')
    expect(bodies).toEqual([])
  })

  it('shows the password rule before anything is typed', async () => {
    renderApp('/password/reset?token=abc')
    expect(await screen.findByLabelText('New password')).toHaveAccessibleDescription('At least 8 characters')
  })

  it('disables the form while the reset is in flight', async () => {
    resetAnswers(async () => {
      await delay('infinite')
      return ok()
    })
    renderApp('/password/reset?token=abc')
    await fillAndSubmit()
    expect(await screen.findByRole('button', { name: 'Updating…' })).toBeDisabled()
    expect(screen.getByLabelText('New password')).toBeDisabled()
    expect(screen.getByLabelText('Confirm new password')).toBeDisabled()
  })

  it('skips the page when already signed in', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, makeJwt())
    loadSession()
    const router = renderApp('/password/reset?token=abc')
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha' })).toBeInTheDocument()
    expect(path(router)).toBe('/t')
  })
})
