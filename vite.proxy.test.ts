import { describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { DEFAULT_GATEWAY_URL, GATEWAY_PATHS, gatewayProxy } from './vite.proxy.ts'

describe('gatewayProxy', () => {
  it('proxies exactly the gateway paths nginx proxies', () => {
    expect(Object.keys(gatewayProxy())).toEqual(['/auth/api/', '/operator/api/', '^/health$'])
    expect(GATEWAY_PATHS).toEqual(['/auth/api/', '/operator/api/', '^/health$'])
  })

  it('targets the local gateway by default, rewriting the Host header', () => {
    for (const rule of Object.values(gatewayProxy())) {
      expect(rule).toMatchObject({ target: DEFAULT_GATEWAY_URL, changeOrigin: true })
    }
    expect(DEFAULT_GATEWAY_URL).toBe('http://localhost:3000')
  })

  it('uses a configured target, e.g. the staging gateway', () => {
    expect(gatewayProxy('http://10.0.0.135:3000')['/operator/api/'].target).toBe('http://10.0.0.135:3000')
  })

  it('falls back to the default for an empty target', () => {
    expect(gatewayProxy('')['/auth/api/'].target).toBe(DEFAULT_GATEWAY_URL)
  })

  describe('/health', () => {
    const bypass = (accept?: string) => {
      const rule = gatewayProxy()['^/health$']
      const req = { url: '/health', headers: accept === undefined ? {} : { accept } } as IncomingMessage
      return rule.bypass?.(req, undefined, rule)
    }

    it('serves the panel page to a browser opening it', () => {
      expect(bypass('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')).toBe('/index.html')
    })

    it("proxies the panel's own JSON request, curl and deploy.sh to the gateway", () => {
      expect(bypass('application/json')).toBeUndefined()
      expect(bypass('*/*')).toBeUndefined()
      expect(bypass()).toBeUndefined()
    })

    it('leaves the API paths alone', () => {
      expect(gatewayProxy()['/operator/api/'].bypass).toBeUndefined()
    })
  })
})
