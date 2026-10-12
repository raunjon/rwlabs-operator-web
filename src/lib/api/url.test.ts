import { describe, expect, it } from 'vitest'
import { buildUrl } from './url'

describe('buildUrl', () => {
  it('resolves against the page origin when no base is configured', () => {
    expect(buildUrl('/health', '', 'http://localhost:3020')).toBe('http://localhost:3020/health')
  })

  it('uses the configured base for cross-origin setups', () => {
    expect(buildUrl('/operator/api/leads', 'https://api.example.test', 'http://localhost:3020')).toBe(
      'https://api.example.test/operator/api/leads',
    )
  })

  it('keeps a base path prefix', () => {
    expect(buildUrl('/health', 'https://example.test/gw', 'http://localhost:3020')).toBe(
      'https://example.test/gw/health',
    )
  })

  it('keeps query strings', () => {
    expect(buildUrl('/operator/api/leads?page=2', '', 'http://localhost:3020')).toBe(
      'http://localhost:3020/operator/api/leads?page=2',
    )
  })

  it('rejects relative paths so a typo cannot silently hit the wrong URL', () => {
    expect(() => buildUrl('health', '', 'http://localhost:3020')).toThrow('must start with "/"')
  })
})
