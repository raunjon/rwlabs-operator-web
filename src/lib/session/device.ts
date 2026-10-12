// Device headers auth requires on sign-in (spec §5.2). The gateway copies them into the JWT, so later requests
// only need X-Jwt-Token. Auth rejects a sign-in missing any of the first four.

export const DEVICE_ID_STORAGE_KEY = 'device_id'
const API_VERSION = 'application/api.thirtyplus.v1'

// Fallback when storage is blocked: stable for this page load, so repeated attempts look like one device.
let memoryDeviceId: string | undefined

// A random id created once per browser and kept in localStorage. It identifies the browser, not the person, and
// is the only thing besides the theme that the panel keeps in localStorage.
export function deviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (stored) return stored
    const created = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created)
    return created
  } catch {
    memoryDeviceId ??= crypto.randomUUID()
    return memoryDeviceId
  }
}

// The OS family only (auth needs a value; nothing reads it closely), never the full user agent.
export function osFamily(userAgent: string = navigator.userAgent): string {
  if (/Android/i.test(userAgent)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS'
  if (/CrOS/i.test(userAgent)) return 'ChromeOS'
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macOS'
  if (/Windows/i.test(userAgent)) return 'Windows'
  if (/Linux/i.test(userAgent)) return 'Linux'
  return 'Unknown'
}

export function deviceHeaders(): Record<string, string> {
  return {
    'X-Platform': 'web',
    'X-Device-Identifier': deviceId(),
    'X-App-Version': __APP_VERSION__,
    'X-OS-Version': osFamily(),
    'X-Api-Version': API_VERSION,
  }
}
