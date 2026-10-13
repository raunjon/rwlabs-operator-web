import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSession } from '@/lib/session/session'
import { SESSION_STORAGE_KEY } from '@/lib/session/storage'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { FORGOT_PASSWORD_NEUTRAL_MESSAGE } from './password-reset'
import { UNREACHABLE_MESSAGE } from './session-actions'

const ok = () => HttpResponse.json({ data: { message: 'ok' }, success: true })

// Records the forgot-password bodies the gateway receives, answering with `respond`.
function forgotAnswers(respond: () => Response | Promise<Response>) {
  const bodies: unknown[] = []
  server.use(
    http.post('*/auth/api/password/forgot', async ({ request }) => {
      bodies.push(await request.json())
      return respond()
    }),
  )
  return bodies
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Send reset link' }))

const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname

describe('requesting a password reset', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('posts the email and shows the neutral confirmation on success', async () => {
    const bodies = forgotAnswers(ok)
    renderApp('/password/forgot')
    await userEvent.type(await screen.findByLabelText('Email'), 'ira@example.com')
    await submit()

    expect(await screen.findByText(FORGOT_PASSWORD_NEUTRAL_MESSAGE)).toBeInTheDocument()
    expect(bodies).toEqual([{ email: 'ira@example.com' }])
    // The form is replaced by the confirmation so the user can't repeatedly probe for an email's existence.
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('shows the same neutral confirmation whichever email was typed', async () => {
    forgotAnswers(ok)
    renderApp('/password/forgot')
    await userEvent.type(await screen.findByLabelText('Email'), 'nobody@example.com')
    await submit()
    expect(await screen.findByText(FORGOT_PASSWORD_NEUTRAL_MESSAGE)).toBeInTheDocument()
  })

  it('offers to try a different email once a request has been sent', async () => {
    const bodies = forgotAnswers(ok)
    renderApp('/password/forgot')
    await userEvent.type(await screen.findByLabelText('Email'), 'ira@example.com')
    await submit()
    await screen.findByText(FORGOT_PASSWORD_NEUTRAL_MESSAGE)

    await userEvent.click(screen.getByRole('button', { name: 'Try a different email' }))
    await userEvent.type(await screen.findByLabelText('Email'), 'other@example.com')
    await submit()
    expect(bodies).toEqual([{ email: 'ira@example.com' }, { email: 'other@example.com' }])
  })

  it('checks the email before sending anything, and ties the message to the field', async () => {
    const bodies = forgotAnswers(ok)
    renderApp('/password/forgot')
    await screen.findByLabelText('Email')
    await submit()

    const input = screen.getByLabelText('Email')
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(input).toHaveAccessibleDescription(expect.stringContaining('Enter your email'))
    expect(bodies).toEqual([])
  })

  it('says when the server is unreachable', async () => {
    forgotAnswers(() => HttpResponse.error())
    renderApp('/password/forgot')
    await userEvent.type(await screen.findByLabelText('Email'), 'ira@example.com')
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE_MESSAGE)
    // The form stays so the user can try again.
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('does not leak a server-side 4xx (so the page can’t be used to find accounts)', async () => {
    forgotAnswers(() =>
      HttpResponse.json({ error: { message: 'No account found for that email', status: 404 }, success: false }, { status: 404 }),
    )
    renderApp('/password/forgot')
    await userEvent.type(await screen.findByLabelText('Email'), 'ira@example.com')
    await submit()
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('No account found')
    expect(alert).toHaveTextContent('Something went wrong')
  })

  it('disables the form while the request is in flight', async () => {
    forgotAnswers(async () => {
      await delay('infinite')
      return ok()
    })
    renderApp('/password/forgot')
    await userEvent.type(await screen.findByLabelText('Email'), 'ira@example.com')
    await submit()
    expect(await screen.findByRole('button', { name: 'Sending link…' })).toBeDisabled()
    expect(screen.getByLabelText('Email')).toBeDisabled()
  })

  it('links back to sign in', async () => {
    renderApp('/password/forgot')
    await screen.findByRole('heading', { name: 'Reset your password' })
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('skips the page when already signed in', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, makeJwt())
    loadSession()
    const router = renderApp('/password/forgot')
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha' })).toBeInTheDocument()
    expect(path(router)).toBe('/t')
  })
})
