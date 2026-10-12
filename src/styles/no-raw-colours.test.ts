import { describe, expect, it } from 'vitest'

// Colours live only in tokens.css. Anything else in src/ must use token utilities or var(--token).
const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/**/*.gen.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(|-\[#/gi

describe('raw colours outside tokens.css', () => {
  it('scans the app sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10)
  })

  it.each(Object.entries(sources))('%s has none', (_path, source) => {
    expect(source.match(RAW_COLOUR)).toBeNull()
  })
})
