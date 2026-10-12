import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

describe('contrastRatio', () => {
  it('spans 1:1 to 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrastRatio('#7a8594', '#7a8594')).toBe(1)
  })

  it('does not depend on argument order', () => {
    expect(contrastRatio('#1a2330', '#f7f8f9')).toBe(contrastRatio('#f7f8f9', '#1a2330'))
  })

  // Production CSS is minified (#ffffff becomes #fff) and browsers report computed colours as rgb().
  it.each(['#fff', '#FFFFFF', 'rgb(255, 255, 255)', 'rgb(255 255 255)', 'rgba(255, 255, 255, 1)', ' #ffffff '])(
    'reads %j as white',
    (white) => {
      expect(contrastRatio(white, '#1a2330')).toBeCloseTo(contrastRatio('#ffffff', '#1a2330'))
    },
  )

  it.each(['', 'white', '#ffff', 'oklch(1 0 0)', 'var(--card)'])('rejects %j', (value) => {
    expect(() => contrastRatio(value, '#000000')).toThrow(/Expected a #rgb, #rrggbb or rgb\(\) colour/)
  })
})
