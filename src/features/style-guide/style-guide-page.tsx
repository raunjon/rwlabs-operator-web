import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { contrastRatio } from '@/lib/contrast'
import { useResolvedTheme } from '@/lib/theme'
import { CONTRAST_PAIRS } from '@/styles/contrast-pairs'

const RAMPS = ['primary', 'secondary', 'neutral', 'success', 'warning', 'error', 'info']
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]

const SEMANTIC_TOKENS = [
  'background',
  'foreground',
  'card',
  'muted',
  'muted-foreground',
  'border',
  'input',
  'ring',
  'primary',
  'primary-hover',
  'primary-foreground',
  'link',
  'secondary',
  'secondary-foreground',
  'accent',
  'success',
  'success-subtle',
  'warning',
  'warning-subtle',
  'destructive',
  'destructive-subtle',
  'info',
  'info-subtle',
]

const RADII = [
  ['none', 'rounded-none', '0'],
  ['xs', 'rounded-xs', '4px'],
  ['sm', 'rounded-sm', '8px'],
  ['md', 'rounded-md', '12px'],
  ['lg', 'rounded-lg', '16px'],
  ['xl', 'rounded-xl', '20px'],
  ['2xl', 'rounded-2xl', '24px'],
  ['3xl', 'rounded-3xl', '32px'],
  ['full', 'rounded-full', '∞'],
] as const

const SPACING = [
  ['1', 'w-1', '4px'],
  ['2', 'w-2', '8px'],
  ['3', 'w-3', '12px'],
  ['4', 'w-4', '16px'],
  ['6', 'w-6', '24px'],
  ['8', 'w-8', '32px'],
  ['12', 'w-12', '48px'],
  ['16', 'w-16', '64px'],
  ['24', 'w-24', '96px'],
  ['32', 'w-32', '128px'],
] as const

const TYPE_SCALE = [
  ['text-3xl font-semibold', '3xl · 30px semibold'],
  ['text-2xl font-semibold', '2xl · 24px semibold'],
  ['text-xl font-semibold', 'xl · 20px semibold'],
  ['text-lg font-medium', 'lg · 18px medium'],
  ['text-base', 'base · 16px'],
  ['text-sm', 'sm · 14px (default for UI)'],
  ['text-xs', 'xs · 12px'],
] as const

// Current value of each CSS custom property, as written in the stylesheet (production CSS is minified, so white
// reads back in its three-digit form). Read during render: the theme subscription re-renders this page whenever
// light/dark switches.
function readTokenValues(names: string[]): Record<string, string> {
  const style = getComputedStyle(document.documentElement)
  return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(`--${name}`).trim()]))
}

// Each token as the browser computes it, a form contrastRatio always reads, whatever the stylesheet wrote.
function resolveColours(names: string[]): Record<string, string> {
  const probe = document.createElement('span')
  document.body.append(probe)
  try {
    return Object.fromEntries(
      names.map((name) => {
        probe.style.color = ''
        probe.style.color = `var(--${name})`
        return [name, getComputedStyle(probe).color]
      }),
    )
  } finally {
    probe.remove()
  }
}

// null when a colour can't be read, so one odd value shows as "–" instead of breaking the page.
function safeContrast(fg: string | undefined, bg: string | undefined): number | null {
  if (!fg || !bg) return null
  try {
    return contrastRatio(fg, bg)
  } catch {
    return null
  }
}

const CONTRAST_TOKEN_NAMES = [...new Set(CONTRAST_PAIRS.flatMap(({ fg, bg }) => [fg, bg]))]

const TOKEN_NAMES = [
  ...new Set([
    ...RAMPS.flatMap((ramp) => STEPS.map((step) => `palette-${ramp}-${step}`)),
    ...SEMANTIC_TOKENS,
  ]),
]

// Internal reference for reviewing the design system: every token and shared component state, in either mode.
export function StyleGuidePage() {
  const theme = useResolvedTheme()
  const values = readTokenValues(TOKEN_NAMES)
  const colours = resolveColours(CONTRAST_TOKEN_NAMES)

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">Style guide</h1>
          <p className="text-muted-foreground">
            Design tokens and shared components, showing the {theme} theme. Colours come from{' '}
            <code className="font-mono text-sm">src/styles/tokens.css</code>.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link to="/" className="text-sm text-link underline-offset-4 hover:underline">
            Start page
          </Link>
        </div>
      </header>

      <Section title="Palette" description="Figma's ramps. Dark mode swaps in the dark ramps; 500 is the same in both.">
        <div className="space-y-4">
          {RAMPS.map((ramp) => (
            <div key={ramp} className="grid grid-cols-[6rem_1fr] items-start gap-4">
              <h3 className="pt-3 text-sm font-medium capitalize">{ramp}</h3>
              <ol className="grid grid-cols-5 gap-2 sm:grid-cols-10" aria-label={`${ramp} ramp`}>
                {STEPS.map((step) => {
                  const name = `palette-${ramp}-${step}`
                  return (
                    <li key={step} className="space-y-1">
                      <div className="h-12 rounded-sm border" style={{ background: `var(--${name})` }} />
                      <div className="text-xs font-medium">{step}</div>
                      <div className="font-mono text-xs text-muted-foreground uppercase">{values[name]}</div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Semantic tokens" description="What components use. Each maps to a palette step per mode.">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SEMANTIC_TOKENS.map((name) => (
            <li key={name} className="flex items-center gap-3 rounded-sm border bg-card p-2">
              <div className="size-10 shrink-0 rounded-xs border" style={{ background: `var(--${name})` }} />
              <div className="min-w-0">
                <div className="font-mono text-sm">--{name}</div>
                <div className="font-mono text-xs text-muted-foreground uppercase">{values[name]}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Contrast"
        description="Every text pair needs 4.5:1 and every control border or focus ring 3:1 (WCAG AA). tokens.test.ts enforces the same list."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sample</TableHead>
              <TableHead>Foreground</TableHead>
              <TableHead>Background</TableHead>
              <TableHead>Ratio</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CONTRAST_PAIRS.map(({ fg, bg, min }) => {
              const ratio = safeContrast(colours[fg], colours[bg])
              return (
                <TableRow key={`${fg}/${bg}`}>
                  <TableCell>
                    <span
                      className="inline-block rounded-xs border px-2 py-0.5 text-sm font-medium"
                      style={{ color: `var(--${fg})`, background: `var(--${bg})` }}
                    >
                      Aa
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">--{fg}</TableCell>
                  <TableCell className="font-mono text-xs">--{bg}</TableCell>
                  <TableCell className="tabular-nums">{ratio === null ? '–' : `${ratio.toFixed(2)}:1`}</TableCell>
                  <TableCell>
                    {ratio === null ? null : ratio >= min ? (
                      <Badge variant="success">Pass {min}:1</Badge>
                    ) : (
                      <Badge variant="destructive">Fails {min}:1</Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Section>

      <Section title="Typography" description="Inter, self-hosted. UI text defaults to 14px.">
        <div className="space-y-3">
          {TYPE_SCALE.map(([className, label]) => (
            <p key={label} className={className}>
              {label} <span className="text-muted-foreground">· The quick brown fox jumps over the lazy dog</span>
            </p>
          ))}
          <p className="text-sm">
            Body text with a <a href="#typography" className="text-link underline underline-offset-4">link</a> and{' '}
            <code className="rounded-xs bg-muted px-1 py-0.5 font-mono text-xs">inline code</code>.
          </p>
        </div>
      </Section>

      <Section title="Buttons" description="Tab through them to see the focus ring.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Primary</Button>
            <Button variant="secondary" disabled>
              Secondary
            </Button>
            <Button variant="outline" disabled>
              Outline
            </Button>
            <Button variant="destructive" disabled>
              Delete
            </Button>
            <span className="text-sm text-muted-foreground">Disabled</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" variant="outline" aria-label="Add">
              +
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="sg-name" label="Event name">
            <Input placeholder="Saturday mixer" />
          </Field>
          <Field id="sg-email" label="Email" error="Enter an email address like name@example.com">
            <Input type="email" defaultValue="not-an-email" />
          </Field>
          <Field id="sg-password" label="Password" hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" />
          </Field>
          <Field id="sg-venue" label="Venue (disabled)">
            <Input defaultValue="The Loft" disabled />
          </Field>
          <Field id="sg-notes" label="Notes">
            <Textarea placeholder="Anything the team should know" />
          </Field>
        </div>
      </Section>

      <Section title="Loading" description="Skeleton blocks stand in for content while it loads; the group announces itself as busy.">
        <Card className="max-w-sm">
          <CardContent role="status" aria-label="Loading example" className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Leads this week</CardTitle>
              <CardDescription>Synced from Meta lead forms</CardDescription>
              <CardAction>
                <Badge variant="success">Live</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">128</p>
            </CardContent>
            <CardFooter>
              <Button size="sm">View leads</Button>
              <Button size="sm" variant="ghost">
                Export
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>No events yet</CardTitle>
              <CardDescription>Create your first event to start collecting entries.</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button size="sm">Create event</Button>
            </CardFooter>
          </Card>
        </div>
      </Section>

      <Section title="Alerts">
        <div className="grid gap-3">
          <Alert>
            <AlertTitle>Default</AlertTitle>
            <AlertDescription>Neutral information that needs no colour.</AlertDescription>
          </Alert>
          <Alert variant="info">
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>Meta sync runs every 15 minutes.</AlertDescription>
          </Alert>
          <Alert variant="success">
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>The venue was updated.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Credentials expire soon</AlertTitle>
            <AlertDescription>Reconnect Meta before 30 October to keep leads flowing.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Couldn't save the event</AlertTitle>
            <AlertDescription>Name can't be blank.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Section>

      <Section title="Table">
        <Table>
          <TableCaption>Recent leads (sample data)</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Asha Rao</TableCell>
              <TableCell>Saturday mixer</TableCell>
              <TableCell>
                <Badge variant="success">Confirmed</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">34</TableCell>
            </TableRow>
            <TableRow data-state="selected">
              <TableCell className="font-medium">Vikram Mehta</TableCell>
              <TableCell>Wine & dine</TableCell>
              <TableCell>
                <Badge variant="warning">Pending payment</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">38</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Neha Kapoor</TableCell>
              <TableCell>Saturday mixer</TableCell>
              <TableCell>
                <Badge variant="destructive">Cancelled</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">31</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Section>

      <Section title="Radius" description="Figma's scale. Controls use sm, cards and tables md, badges full.">
        <ul className="flex flex-wrap gap-4">
          {RADII.map(([name, className, size]) => (
            <li key={name} className="space-y-1 text-xs">
              <div className={`size-16 border-2 border-foreground bg-muted ${className}`} />
              <div className="font-medium">{name}</div>
              <div className="text-muted-foreground">{size}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Spacing" description="4pt grid: Tailwind's spacing step is 4px, so p-4 = 16px = Figma space-4.">
        <ul className="space-y-2">
          {SPACING.map(([name, className, size]) => (
            <li key={name} className="grid grid-cols-[5rem_4rem_1fr] items-center gap-3 text-xs">
              <span className="font-mono">space-{name}</span>
              <span className="text-muted-foreground">{size}</span>
              <div className={`h-3 rounded-xs bg-primary ${className}`} />
            </li>
          ))}
        </ul>
      </Section>
    </main>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = title.toLowerCase().replace(/\s+/g, '-')
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="space-y-1 border-b pb-2">
        <h2 id={id} className="text-xl font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}
