// WCAG 2.x contrast ratio between two sRGB colours: 1 (identical) to 21 (black on white).
// AA needs 4.5 for body text and 3 for large text, control borders and focus indicators.
// Accepts #rgb, #rrggbb and rgb()/rgba() (what browsers report for computed colours); throws on anything else.
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

function luminance(colour: string): number {
  const [r, g, b] = parseRgb(colour).map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function parseRgb(colour: string): [number, number, number] {
  const value = colour.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i.exec(value)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  throw new Error(`Expected a #rgb, #rrggbb or rgb() colour, got "${colour}"`)
}
