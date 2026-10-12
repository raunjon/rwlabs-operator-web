// The gateway JWT lives in sessionStorage and nowhere else (spec §5.2): it survives a reload and is gone when the
// tab closes. Never put it in localStorage, cookies, URLs, logs or error messages.

export const SESSION_STORAGE_KEY = 'session_jwt'

export function readToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return null
  }
}

// false when storage is blocked: the caller decides whether a session that won't survive a reload is acceptable.
export function writeToken(jwt: string): boolean {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, jwt)
    return true
  } catch {
    return false
  }
}

export function clearToken() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Nothing stored, or storage blocked: either way there's no token left to clear.
  }
}
