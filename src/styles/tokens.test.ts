/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/contrast'
import { CONTRAST_PAIRS } from './contrast-pairs'

// Read from disk: Vitest's CSS handling empties `?raw` imports of .css files.
const css = readFileSync(resolvePath(process.cwd(), 'src/styles/tokens.css'), 'utf8')

type Tokens = Record<string, string>

function block(selector: string): Tokens {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = new RegExp(`^${escaped} \\{([\\s\\S]*?)^\\}`, 'm').exec(css)?.[1]
  if (!body) throw new Error(`No ${selector} block in tokens.css`)
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const light = block(':root')
const modes: Record<string, Tokens> = { light, dark: { ...light, ...block('.dark') } }

function resolve(tokens: Tokens, name: string): string {
  const value = tokens[name]
  if (value === undefined) throw new Error(`--${name} is not defined`)
  const reference = /^var\(--([\w-]+)\)$/.exec(value)
  return reference ? resolve(tokens, reference[1]) : value
}

const RAMPS = ['primary', 'secondary', 'neutral', 'success', 'warning', 'error', 'info']
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

describe.each(Object.entries(modes))('%s tokens', (_mode, tokens) => {
  it.each(CONTRAST_PAIRS)('$fg on $bg reaches $min:1', ({ fg, bg, min }) => {
    expect(contrastRatio(resolve(tokens, fg), resolve(tokens, bg))).toBeGreaterThanOrEqual(min)
  })

  it('defines every palette step', () => {
    for (const ramp of RAMPS) {
      for (const step of STEPS) expect(tokens[`palette-${ramp}-${step}`]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('builds semantic tokens only from the palette', () => {
    const semantic = Object.entries(tokens).filter(([name]) => !name.startsWith('palette-'))
    expect(semantic.length).toBeGreaterThan(0)
    for (const [name, value] of semantic) expect(value, `--${name}`).toMatch(/^var\(--palette-[\w-]+\)$/)
  })
})

it('keeps the brand base (500) the same in light and dark, as the Figma dark ramps do', () => {
  for (const ramp of RAMPS) {
    expect(modes.dark[`palette-${ramp}-500`]).toBe(modes.light[`palette-${ramp}-500`])
  }
})
