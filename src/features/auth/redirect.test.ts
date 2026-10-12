import { describe, expect, it } from 'vitest'
import { safeRedirect } from './redirect'

const ORIGIN = 'https://panel.example.com'

describe('safeRedirect', () => {
  it.each([
    ['/t', '/t'],
    ['/t/leads?page=2#top', '/t/leads?page=2#top'],
    ['/admin/tenants/4', '/admin/tenants/4'],
  ])('keeps the path %s', (target, expected) => {
    expect(safeRedirect(target, ORIGIN)).toBe(expected)
  })

  it.each([
    ['another site', 'https://evil.example/steal'],
    ['a protocol-relative URL', '//evil.example/steal'],
    ['a backslash trick', '/\\evil.example'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a relative path', 't/leads'],
    ['the login page', '/login?redirect=/t'],
    ['nothing', undefined],
    ['a non-string', ['/t']],
  ])('rejects %s', (_label, target) => {
    expect(safeRedirect(target, ORIGIN)).toBeNull()
  })
})
