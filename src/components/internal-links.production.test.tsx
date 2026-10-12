import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSession } from '@/lib/session/session'
import { SESSION_STORAGE_KEY } from '@/lib/session/storage'
import { makeJwt } from '@/test/jwt'
import { renderApp } from '@/test/render'

// A production build: no VITE_APP_ENV, so internal pages are off.
vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config')>()
  return { ...actual, config: actual.readConfig({ MODE: 'production' }) }
})

describe('internal pages in production', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
  })

  it('has no internal links on the login page', async () => {
    renderApp('/login')
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByRole('link', { name: 'Style guide' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'System health' })).not.toBeInTheDocument()
  })

  it('has no internal section in the sidebar', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, makeJwt())
    loadSession()
    renderApp('/t')
    await screen.findByRole('heading', { name: 'Welcome, Asha' })
    expect(screen.queryByRole('navigation', { name: 'Internal' })).not.toBeInTheDocument()
  })

  it.each(['/style-guide', '/health'])('serves %s as not found', async (path) => {
    renderApp(path)
    expect(await screen.findByRole('heading', { name: "This page doesn't exist." })).toBeInTheDocument()
  })
})
