# Design system

How the operator panel looks and how to keep it consistent. The live reference is the style guide page at
[`/style-guide`](http://localhost:3020/style-guide) (`src/features/style-guide/style-guide-page.tsx`). It renders every
token, contrast pair and shared component in the current theme, and has a theme toggle. When this doc and the page
disagree, the code wins: fix the doc.

Source of the values: the PlusOne Figma file,
[Colours and rules](https://www.figma.com/design/mhtdApKR13mUNcV4DtQGPe/PlusOne?node-id=1489-3553&m=dev) (light) and
[Dark Mode — Color Palette](https://www.figma.com/design/mhtdApKR13mUNcV4DtQGPe/PlusOne?node-id=1886-4602&m=dev) (dark).

## Files

| File | What it holds |
|---|---|
| `src/styles/tokens.css` | The only place colours, radii and fonts are written down: palette, semantic tokens, Tailwind `@theme` mapping, base styles (focus ring, body) |
| `src/styles/contrast-pairs.ts` | Every foreground/background token pair the UI actually uses, with its WCAG minimum |
| `src/styles/tokens.test.ts` | Holds every pair to its minimum in both modes; checks the palette is complete and semantic tokens only reference it |
| `src/styles/no-raw-colours.test.ts` | Fails on any hex/rgb/hsl/oklch/`-[#…]` in `src/` outside `tokens.css` (and `src/lib/contrast.ts`) |
| `src/lib/theme.ts` | Light/dark preference store and the `dark` class on `<html>` |
| `index.html` (inline script) | Sets the `dark` class before first paint, so reloads don't flash light |
| `src/components/ui/` | Shared components (shadcn/ui, restyled to tokens) |

## Colour

Two layers. Components use only the second.

### 1. Palette: `--palette-<ramp>-<step>`

Figma's ramps, copied verbatim. Ramps: `primary`, `secondary`, `neutral`, `success`, `warning`, `error`, `info`.
Steps: `50`–`900` (light neutral also has `25`, pure white, used for cards and text on fills).

Dark mode swaps in Figma's dark ramps under `.dark`. They run the other way (50 is the darkest) and keep `500`, the
brand base, identical to light; a test enforces that. So `neutral-50` is "page background" in both modes, and the
basics (page, text, borders, input, focus ring) point at the same step in both. Surfaces, brand and status tokens
pick their own step per mode.

Only `tokens.css` and the style guide page use palette tokens.

### 2. Semantic tokens

What components use, through the Tailwind utilities they generate (`bg-background`, `text-muted-foreground`,
`border-input`, `bg-success-subtle`, ...). Each mode picks its own palette step per token.

| Token | Use |
|---|---|
| `background` / `foreground` | Page surface and body text |
| `card` / `card-foreground` | Raised surfaces: cards, tables, outline buttons |
| `muted` / `muted-foreground` | Quiet fills (table header/footer, disabled inputs, inline code, the theme toggle track); secondary text |
| `accent` / `accent-foreground` | Hover and selected state for ghost/outline buttons and table rows |
| `border` | Dividers and container edges (applied to `*` by default) |
| `input` | Form control borders (3:1 against page and card) |
| `ring` | Focus ring (brand 500) |
| `primary`, `primary-hover`, `primary-foreground` | Main action |
| `secondary`, `secondary-hover`, `secondary-foreground` | Tinted secondary action |
| `link` | Inline links |
| `success`, `warning`, `destructive`, `info` | Status colour (see below) |
| `destructive-hover` | Hover for destructive buttons |

**Why light `primary` isn't brand 500:** white on `primary-500` is only 3.5:1, so light mode buttons use `700` and
500 stays the focus ring and accent. Dark mode keeps 500 as Figma does, with dark text on it (5.1:1).

**Status colours** come as a set of four per status:

- `--<status>`: text, icons and borders on the page or a card; also a solid fill
- `--<status>-foreground`: text on the solid fill
- `--<status>-subtle`: tinted alert/badge background
- `--<status>-border`: the tinted container's edge

The status names are `success`, `warning`, `destructive` (Figma's `error` ramp) and `info`.

### Rules

- **No raw colours** in `src/` outside `tokens.css`. Use a token utility or `var(--token)`. The test fails otherwise;
  it skips only test files and `src/lib/contrast.ts` (the colour parser, which has to name colour formats).
- **No `dark:` variants.** Tokens switch with the `dark` class, so components are written once.
- **Semantic tokens are built only from the palette** (`var(--palette-…)`), never a literal value.
- **New pair, new entry.** When a component puts a token on a background it hasn't been on before, add the pair to
  `contrast-pairs.ts` (`text()` for 4.5:1, `ui()` for 3:1 control edges and focus). `npm test` then checks it in
  both modes and `/style-guide` shows its live ratio.
- **Changing a value:** edit `tokens.css`, run `npx vitest run src/styles`, then look at `/style-guide` in both
  themes.
- **Adding a token:** define it in `:root` and `.dark`, map it in `@theme inline` as `--color-<name>`, add its pairs,
  and it appears on the style guide.

## Light and dark mode

- The preference is `system` (default, follows the OS), `light` or `dark`. It lives in `localStorage` under `theme`,
  which holds nothing else. `system` removes the key.
- The resolved mode is the `dark` class on `<html>`. The inline script in `index.html` sets it before the first
  paint; `initTheme()` in `src/lib/theme.ts` takes over once the app starts and follows OS changes. **Keep the
  storage key, values and media query identical in both.**
- Switching adds `.theme-switching` for one frame to disable transitions, so `transition-colors` elements don't fade
  through in-between colours.
- Components read the mode with `useThemePreference()` / `useResolvedTheme()`; the toggle is
  `src/components/theme-toggle.tsx`.

## Typography

Inter Variable, self-hosted via `@fontsource-variable/inter` (`font-sans`). `body` has no size set, so text is 16px
unless a component sets one: use `text-sm` (14px) for UI text, as the shared components do.

| Class | Size | Typical use |
|---|---|---|
| `text-3xl font-semibold` | 30px | Page hero (rare) |
| `text-2xl font-semibold` | 24px | Page title |
| `text-xl font-semibold` | 20px | Section heading |
| `text-lg font-medium` | 18px | Sub-heading |
| `text-base` | 16px | Long-form text |
| `text-sm` | 14px | Default UI text, controls, tables |
| `text-xs` | 12px | Captions, badges, inline code |

Links: `text-link underline-offset-4`, plus `underline` inside running text or `hover:underline` for standalone links
(nav, "Forgot password?"). Inline code: `rounded-xs bg-muted px-1 py-0.5 font-mono text-xs`.

## Radius

Figma's scale replaces Tailwind's defaults:

| Token | Value | Used for |
|---|---|---|
| `rounded-none` | 0 | |
| `rounded-xs` | 4px | Inline code, small swatches |
| `rounded-sm` | 8px | Buttons, inputs, alerts, controls |
| `rounded-md` | 12px | Cards, tables |
| `rounded-lg` | 16px | |
| `rounded-xl` | 20px | |
| `rounded-2xl` | 24px | |
| `rounded-3xl` | 32px | |
| `rounded-full` | 9999px | Badges |

## Spacing

4pt grid with no override: Tailwind's spacing step is 4px, so `p-4` = 16px = Figma `space-4`.

## Focus

One focus style everywhere, set in the base layer: `:focus-visible` gets a 2px `ring` outline, offset 2px. It is
held to 3:1 on page and card. Don't remove outlines or add per-component focus styles; check keyboard access by
tabbing through `/style-guide`.

## Components (`src/components/ui/`)

| Component | Variants / parts |
|---|---|
| `Button` | `variant`: `default`, `secondary`, `outline`, `ghost`, `destructive`, `link`. `size`: `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (36px square). `asChild` to render a link |
| `Badge` | `default`, `secondary`, `outline`, `info`, `success`, `warning`, `destructive` (status ones use the subtle set) |
| `Alert` | `default`, `info`, `success`, `warning`, `destructive`. Gets `role="alert"` for destructive, `role="status"` otherwise |
| `Card` | `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`. `CardTitle` renders an `h3`; where the page needs another heading level, put your own heading in `CardHeader` |
| `Table` | `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`. Body rows use `accent` on hover/selection; header rows don't |
| `Input`, `Textarea`, `Label` | Form fields, bordered with `input`. Set `aria-invalid` for the error state; pair `Label` and field with `htmlFor`/`id` |
| `Field` | `Label` + one control + optional `hint` and `error` (muted and destructive text). Pass the control as the only child: `Field` sets its `id`, `aria-invalid` while there is an error, and `aria-describedby` for the error and hint |

Use these before writing new markup. Status always means one of the four status names; don't invent colours for
states.

### Adding a component

- **shadcn:** `npx shadcn@3.8.5 add <name>`. The CLI writes `import { cn } from "cn"` and installs unrelated `cn` and
  `radix-ui` packages: uninstall both and import `cn` from `@/lib/utils`.
- **21st.dev:** install via the shadcn CLI, then replace `next/link`/`next/image`, move any Tailwind 3 config into
  `@theme`, restyle to tokens, check keyboard access, and note the licence at the top of the file.
- In both cases: swap any colours for semantic tokens, add new token pairs to `contrast-pairs.ts`, add an example to
  the style guide page, and cover it in `components.test.tsx`.

## Checklist for a UI change

- [ ] Only semantic token utilities; no raw colours, no `dark:`
- [ ] Any new fg/bg combination is in `contrast-pairs.ts`
- [ ] Shared components used where they exist; new ones shown on `/style-guide`
- [ ] Checked in light and dark on `/style-guide` and the real screen
- [ ] Keyboard: everything reachable, focus ring visible
- [ ] `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`, plus `npm run e2e` when pages or routes
  changed
