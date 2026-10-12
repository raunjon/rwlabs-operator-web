// The token pairs the UI actually puts on top of each other, by token name (without the leading --). tokens.test.ts
// holds them to WCAG AA in both modes and the style guide shows their live ratios. Add a pair when a component
// starts using a new combination.

export type ContrastPair = { fg: string; bg: string; min: 4.5 | 3 }

export const STATUSES = ['success', 'warning', 'destructive', 'info'] as const

const text = (fg: string, bg: string): ContrastPair => ({ fg, bg, min: 4.5 })
const ui = (fg: string, bg: string): ContrastPair => ({ fg, bg, min: 3 })

export const CONTRAST_PAIRS: ContrastPair[] = [
  text('foreground', 'background'),
  text('foreground', 'card'),
  text('foreground', 'muted'),
  text('card-foreground', 'card'),
  text('muted-foreground', 'background'),
  text('muted-foreground', 'card'),
  text('muted-foreground', 'muted'),
  text('link', 'background'),
  text('link', 'card'),
  text('primary-foreground', 'primary'),
  text('primary-foreground', 'primary-hover'),
  text('secondary-foreground', 'secondary'),
  text('secondary-foreground', 'secondary-hover'),
  text('accent-foreground', 'accent'),
  // Body rows turn accent on hover/selection: cells inherit foreground, secondary cell text is muted.
  text('foreground', 'accent'),
  text('muted-foreground', 'accent'),
  text('destructive-foreground', 'destructive-hover'),
  ...STATUSES.flatMap((status) => [
    text(status, 'background'),
    text(status, 'card'),
    text(status, `${status}-subtle`),
    text('foreground', `${status}-subtle`),
    text(`${status}-foreground`, status),
  ]),
  // Control boundaries and focus indicators (WCAG 1.4.11).
  ui('input', 'background'),
  ui('input', 'card'),
  ui('ring', 'background'),
  ui('ring', 'card'),
]
