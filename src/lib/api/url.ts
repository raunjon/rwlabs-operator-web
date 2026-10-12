import { config } from '@/config'

// Every API URL is built here, so switching between same-origin (nginx / Vite proxy) and a cross-origin gateway
// is just VITE_API_BASE_URL. Always returns an absolute URL (fetch in tests has no page to resolve against).
export function buildUrl(path: string, base: string = config.apiBaseUrl, origin: string = window.location.origin) {
  if (!path.startsWith('/')) throw new Error(`API path must start with "/": ${path}`)
  return `${base || origin}${path}`
}
