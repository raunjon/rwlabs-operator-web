import { useSyncExternalStore } from 'react'
import { decodeSession, type Session } from './jwt'
import { clearToken, readToken, writeToken } from './storage'

export type { Session } from './jwt'

// Who gets into the panel. A UI rule only: operator still checks permissions on every request (spec §5.2).
export const PANEL_ROLES = ['admin', 'super_admin'] as const
export type PanelRole = (typeof PANEL_ROLES)[number]

export function canUsePanel(role: string): role is PanelRole {
  return (PANEL_ROLES as readonly string[]).includes(role)
}

export type PanelSession = Session & { role: PanelRole }

// Where each role lands after signing in: tenant admins in the tenant shell, super admins in the admin shell.
export function homePath(role: PanelRole): '/t' | '/admin' {
  return role === 'super_admin' ? '/admin' : '/t'
}

// Why the last session ended, so the login page can say so. 'expired' covers both the expiry time passing and
// the server answering 401.
export type EndReason = 'expired' | 'signed-out'

interface Current {
  session: PanelSession
  // The raw JWT. Kept out of Session so it never reaches React state or props.
  token: string
}

let current: Current | null = null
let endReason: EndReason | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

export function isExpired(session: Session, now: number = Date.now()): boolean {
  return session.expiresAt !== null && session.expiresAt <= now
}

// Reads the stored token into memory. Call once on start (main.tsx), before the first route loads. A stored token
// that is unreadable, for a role that can't use the panel, or past its expiry is discarded.
export function loadSession() {
  current = null
  endReason = null
  const token = readToken()
  if (!token) return
  const session = decodeSession(token)
  if (!session || !canUsePanel(session.role)) {
    clearToken()
    return
  }
  if (isExpired(session)) {
    clearToken()
    endReason = 'expired'
    return
  }
  current = { session: { ...session, role: session.role }, token }
}

export type StartResult = { ok: true; session: PanelSession } | { ok: false; reason: 'invalid' | 'not-allowed' }

// Keeps a JWT the gateway just issued. Roles outside PANEL_ROLES are refused and nothing is stored; the caller
// signs that token out on the server.
export function startSession(token: string): StartResult {
  const session = decodeSession(token)
  if (!session || isExpired(session)) return { ok: false, reason: 'invalid' }
  if (!canUsePanel(session.role)) return { ok: false, reason: 'not-allowed' }
  // If storage is blocked the session still works, but only until the page reloads.
  writeToken(token)
  current = { session: { ...session, role: session.role }, token }
  endReason = null
  notify()
  return { ok: true, session: current.session }
}

export function endSession(reason: EndReason) {
  clearToken()
  const hadSession = current !== null
  current = null
  endReason = reason
  if (hadSession) notify()
}

// The signed-in session, or null. Ends the session first if it has expired since it was loaded, so guards and the
// API client never act on a stale one.
export function currentSession(): PanelSession | null {
  if (current && isExpired(current.session)) endSession('expired')
  return current?.session ?? null
}

// For the API layer only: the JWT to send as X-Jwt-Token.
export function sessionToken(): string | null {
  return currentSession() ? (current?.token ?? null) : null
}

export function sessionEndReason(): EndReason | null {
  return endReason
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSession(): PanelSession | null {
  return useSyncExternalStore(subscribe, () => current?.session ?? null)
}
