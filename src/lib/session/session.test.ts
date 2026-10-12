import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeJwt } from '@/test/jwt'
import { decodeSession } from './jwt'
import {
  canUsePanel,
  currentSession,
  endSession,
  homePath,
  loadSession,
  sessionEndReason,
  sessionToken,
  startSession,
} from './session'
import { SESSION_STORAGE_KEY } from './storage'

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600
const anHourAgo = () => Math.floor(Date.now() / 1000) - 3600

describe('decodeSession', () => {
  it('reads the claims the panel shows, but not the raw auth token', () => {
    const expires = inAnHour()
    const session = decodeSession(makeJwt({ expires_at: expires, first_name: 'Zoë' }))
    expect(session).toEqual({
      userId: 7,
      firstName: 'Zoë',
      lastName: 'Rao',
      email: 'asha@example.com',
      role: 'admin',
      roleDisplayName: 'Admin',
      tenantId: 3,
      expiresAt: expires * 1000,
    })
    expect(JSON.stringify(session)).not.toContain('raw-auth-token')
  })

  it('has no tenant for a super admin', () => {
    expect(decodeSession(makeJwt({ role_name: 'super_admin', tenant_id: null }))?.tenantId).toBeNull()
  })

  it.each([
    ['milliseconds', 1_900_000_000_000, 1_900_000_000_000],
    ['an ISO string', '2030-03-17T17:46:40.000Z', 1_900_000_000_000],
    ['a numeric string', '1900000000', 1_900_000_000_000],
    ['nothing', undefined, null],
    ['garbage', 'soon', null],
  ])('reads expires_at given as %s', (_label, value, expected) => {
    expect(decodeSession(makeJwt({ expires_at: value }))?.expiresAt).toBe(expected)
  })

  it.each([
    ['not a JWT', 'abc'],
    ['a payload that is not JSON', 'a.b.c'],
    ['a payload with no role', makeJwt({ role_name: undefined })],
    ['a JSON array payload', `x.${btoa('[]')}.y`],
  ])('rejects %s', (_label, token) => {
    expect(decodeSession(token)).toBeNull()
  })
})

describe('role gate', () => {
  it.each(['admin', 'super_admin'])('lets %s in', (role) => expect(canUsePanel(role)).toBe(true))
  it.each(['user', 'guest', 'event_manager', 'lead_manager', ''])('keeps %j out', (role) =>
    expect(canUsePanel(role)).toBe(false),
  )

  it('sends each role to its own area', () => {
    expect(homePath('admin')).toBe('/t')
    expect(homePath('super_admin')).toBe('/admin')
  })
})

describe('session store', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    loadSession()
  })
  afterEach(() => vi.restoreAllMocks())

  it('keeps a panel role session in sessionStorage only', () => {
    const token = makeJwt()
    const result = startSession(token)
    expect(result).toMatchObject({ ok: true, session: { role: 'admin', tenantId: 3 } })
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(token)
    expect(localStorage.length).toBe(0)
    expect(currentSession()?.email).toBe('asha@example.com')
    expect(sessionToken()).toBe(token)
  })

  it('refuses other roles and stores nothing', () => {
    expect(startSession(makeJwt({ role_name: 'user' }))).toEqual({ ok: false, reason: 'not-allowed' })
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(currentSession()).toBeNull()
  })

  it('refuses an unreadable or already expired token', () => {
    expect(startSession('nonsense')).toEqual({ ok: false, reason: 'invalid' })
    expect(startSession(makeJwt({ expires_at: anHourAgo() }))).toEqual({ ok: false, reason: 'invalid' })
    expect(currentSession()).toBeNull()
  })

  it('restores the session after a reload', () => {
    const token = makeJwt({ role_name: 'super_admin' })
    sessionStorage.setItem(SESSION_STORAGE_KEY, token)
    loadSession()
    expect(currentSession()?.role).toBe('super_admin')
    expect(sessionToken()).toBe(token)
  })

  it('drops a stored session that has expired, and says so', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, makeJwt({ expires_at: anHourAgo() }))
    loadSession()
    expect(currentSession()).toBeNull()
    expect(sessionEndReason()).toBe('expired')
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it.each([
    ['unreadable', 'nonsense'],
    ['for a role that cannot use the panel', makeJwt({ role_name: 'user' })],
  ])('drops a stored token that is %s', (_label, token) => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, token)
    loadSession()
    expect(currentSession()).toBeNull()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('ends a session once its expiry time passes', () => {
    vi.useFakeTimers()
    try {
      startSession(makeJwt({ expires_at: Math.floor(Date.now() / 1000) + 60 }))
      expect(currentSession()).not.toBeNull()
      vi.advanceTimersByTime(61_000)
      expect(currentSession()).toBeNull()
      expect(sessionToken()).toBeNull()
      expect(sessionEndReason()).toBe('expired')
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears everything on sign-out and remembers why', () => {
    startSession(makeJwt())
    endSession('signed-out')
    expect(currentSession()).toBeNull()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(sessionEndReason()).toBe('signed-out')
  })

  it('still works for this page load when sessionStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(startSession(makeJwt()).ok).toBe(true)
    expect(currentSession()?.role).toBe('admin')
  })
})
