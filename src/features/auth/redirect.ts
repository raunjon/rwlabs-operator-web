// The page to return to after signing in, from the login URL's ?redirect=. Only paths on this site are accepted,
// so a crafted link can't send someone elsewhere after they sign in (an open redirect), and never the login page
// itself.
export function safeRedirect(target: unknown, origin: string = window.location.origin): string | null {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return null
  }
  let url: URL
  try {
    url = new URL(target, origin)
  } catch {
    return null
  }
  if (url.origin !== origin || url.pathname === '/login') return null
  return `${url.pathname}${url.search}${url.hash}`
}
