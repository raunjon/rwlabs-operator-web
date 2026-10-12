import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSession } from '@/lib/session/session'
import { SESSION_STORAGE_KEY } from '@/lib/session/storage'
import { makeJwt } from '@/test/jwt'
import { renderApp } from '@/test/render'

// Tests run as development, where internal pages are on (as on staging). The production build is covered in
// internal-links.production.test.tsx.
describe('internal links (staging and development)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('appear in the login page footer', async () => {
    renderApp('/login')
    const footer = (await screen.findByRole('heading', { name: 'Sign in' })).closest('main')!.querySelector('footer')!
    expect(within(footer).getByRole('link', { name: 'Style guide' })).toHaveAttribute('href', '/style-guide')
    expect(within(footer).getByRole('link', { name: 'System health' })).toHaveAttribute('href', '/health')
  })

  it('appear in the sidebar and open the page', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, makeJwt())
    loadSession()
    const router = renderApp('/t')
    const internal = await screen.findByRole('navigation', { name: 'Internal' })
    expect(within(internal).getByRole('link', { name: 'System health' })).toHaveAttribute('href', '/health')
    await userEvent.click(within(internal).getByRole('link', { name: 'Style guide' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Style guide' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/style-guide')
  })
})
