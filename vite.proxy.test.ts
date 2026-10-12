import { describe, expect, it } from 'vitest'
import { DEFAULT_GATEWAY_URL, GATEWAY_PATHS, gatewayProxy } from './vite.proxy.ts'

describe('gatewayProxy', () => {
  it('proxies exactly the gateway paths nginx proxies', () => {
    expect(Object.keys(gatewayProxy())).toEqual(['/auth/api/', '/operator/api/', '^/health$'])
    expect(GATEWAY_PATHS).toEqual(['/auth/api/', '/operator/api/', '^/health$'])
  })

  it('targets the local gateway by default, rewriting the Host header', () => {
    for (const rule of Object.values(gatewayProxy())) {
      expect(rule).toEqual({ target: DEFAULT_GATEWAY_URL, changeOrigin: true })
    }
    expect(DEFAULT_GATEWAY_URL).toBe('http://localhost:3000')
  })

  it('uses a configured target, e.g. the staging gateway', () => {
    expect(gatewayProxy('http://10.0.0.135:3000')['/operator/api/'].target).toBe('http://10.0.0.135:3000')
  })

  it('falls back to the default for an empty target', () => {
    expect(gatewayProxy('')['/auth/api/'].target).toBe(DEFAULT_GATEWAY_URL)
  })
})
