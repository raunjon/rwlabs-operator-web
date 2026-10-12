import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEVICE_ID_STORAGE_KEY, deviceHeaders, deviceId, osFamily } from './device'

describe('device headers', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('creates a device id once and reuses it', () => {
    const first = deviceId()
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(first)
    expect(deviceId()).toBe(first)
  })

  it('keeps one id for the page load when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(deviceId()).toBe(deviceId())
  })

  it('sends everything auth requires on sign-in', () => {
    expect(deviceHeaders()).toEqual({
      'X-Platform': 'web',
      'X-Device-Identifier': deviceId(),
      'X-App-Version': __APP_VERSION__,
      'X-OS-Version': expect.any(String),
      'X-Api-Version': 'application/api.thirtyplus.v1',
    })
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/)
  })

  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15', 'macOS'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Windows'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 'Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 'iOS'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', 'ChromeOS'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'Linux'],
    ['curl/8.0', 'Unknown'],
  ])('reports only the OS family for %s', (userAgent, family) => {
    expect(osFamily(userAgent)).toBe(family)
  })
})
