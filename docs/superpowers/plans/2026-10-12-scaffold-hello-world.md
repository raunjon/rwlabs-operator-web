# Operator Web Scaffold + Hello World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Vite + React + TypeScript project for the operator panel whose only page says hello and shows
whether the gateway is reachable through the proxy, runnable locally on port 3020 and in the staging Docker stack.

**Architecture:** A static SPA. Locally, Vite's dev server proxies `/auth/api/*`, `/operator/api/*` and `/health` to
the gateway. In staging, an nginx container serves the build and proxies the same paths. All API calls go through one
client module that resolves URLs against a configurable base. TanStack Router renders pages; TanStack Query fetches
the gateway's health.

**Tech Stack:** Vite 8, React 19, TypeScript 5.9, Tailwind CSS 4, shadcn/ui (hand-installed Button), TanStack Router
+ Query, openapi-typescript + openapi-fetch, Vitest 4 + Testing Library + MSW 2, Playwright, ESLint 9, nginx.

**Spec:** `docs/superpowers/specs/2026-10-12-operator-web-v1-design.md` (step 1 of §10, plus §5.1, §5.5, §6, §8)

**Where to work:**
- The repo is `refactor/rwlabs_operator_web/` (git remote `raunjon/rwlabs-operator-web`). Do all repo tasks on the
  `develop` branch: `git -C rwlabs_operator_web checkout develop`.
- Task 8 also edits files directly in `refactor/` (`docker-compose.yml`, `deploy.sh`, `scripts/*.sh`, `CLAUDE.md`).
  `refactor/` is not its own git repo, so those edits are **not committed**. Report them as uncommitted changes.
- Never read or change anything outside `refactor/`.

All paths below are relative to `refactor/rwlabs_operator_web/` unless they start with `refactor/`.

## Global Constraints

- Product name lives in one place: `PRODUCT_NAME = 'RWLabs'` in `src/config.ts`. Nothing else hardcodes it.
- Dev server: port **3020**, `strictPort: true` (fail rather than move to another port).
- Proxied paths (dev and nginx, identical): `/auth/api/`, `/operator/api/`, `/health`.
- Dev proxy target: `VITE_GATEWAY_URL`, default `http://localhost:3000`.
- API base URL: `VITE_API_BASE_URL`, default empty (same origin). Every API URL is built by `buildUrl` in
  `src/lib/api/url.ts`. No component or feature calls `fetch` with a hand-built URL.
- nginx upstream from env: `GATEWAY_UPSTREAM` (default `http://gateway:3000`) and `GATEWAY_HOST_HEADER` (default
  `localhost:3000`). Never a hardcoded host in the template.
- Colours only through CSS variables in `src/styles/tokens.css` (shadcn neutral defaults for now). No raw hex or oklch
  values in components.
- Exact dependency versions as listed in Task 1 (installed with `npm install -E`). TypeScript stays on 5.9.x:
  `openapi-typescript` requires `^5` and `typescript-eslint` requires `<6.1`.
- Node: major 24 (`.node-version` = `24`; Docker `node:24-alpine`).
- Generated files are committed: `src/routeTree.gen.ts`, `src/lib/api/schema.d.ts`.
- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass at the end of every task from Task 1 on.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **Refreshing a deep link in staging** (`/t/leads/42`) must load the app, and the app must show a "page doesn't
   exist" screen for unknown routes, not a blank page or an nginx 404. Covered: Task 7 (nginx fallback check), Task 6
   (e2e not-found test).
2. **A tab left open across a deploy** requests an old hashed chunk that no longer exists. nginx must return 404 for
   missing `/assets/*`, not `index.html` (which the browser would reject as JavaScript with a confusing MIME error).
   Covered: Task 7.
3. **`./deploy.sh gateway` recreates the gateway container with a new IP.** The panel must keep proxying without its
   own restart (no IP cached at nginx startup). Covered: Task 7 (resolver + variable upstream, recreate test).
4. **The gateway is down, degraded, or returns an HTML error page** (nginx 502, Vite proxy error). The hello page must
   show a clear state with a way to check again, never crash or stay on "checking". Covered: Task 5.
5. **Port 3020 is already taken locally.** `npm run dev` must fail loudly instead of starting on 3021, where the
   start script, e2e config and docs wouldn't find it. Covered: Task 2 (manual check step).

---

## File Structure

```
rwlabs_operator_web/
  .gitignore, .node-version, .dockerignore
  package.json, package-lock.json
  index.html
  vite.config.ts                 plugins, @ alias, dev/preview server (port, proxy), vitest config
  vite.proxy.ts                  gatewayProxy(target): the one list of proxied paths for Vite
  vite.proxy.test.ts
  tsconfig.json, tsconfig.app.json, tsconfig.node.json
  eslint.config.js
  components.json                shadcn CLI config (for future `npx shadcn add`)
  playwright.config.ts
  e2e/hello.spec.ts
  Dockerfile
  nginx/default.conf.template
  README.md, CLAUDE.md
  src/
    main.tsx                     providers + router mount
    router.tsx                   createAppRouter(queryClient)
    routeTree.gen.ts             generated by the TanStack Router plugin (committed)
    config.ts                    PRODUCT_NAME, readConfig(env), config
    config.test.ts
    routes/__root.tsx            root layout + not-found
    routes/index.tsx             "/" → HelloPage
    features/hello/hello-page.tsx
    features/hello/hello-page.test.tsx
    features/health/api.ts       fetchGatewayHealth(), gatewayHealthQuery
    features/health/api.test.ts
    features/health/health-status.tsx
    features/health/health-status.test.tsx
    lib/utils.ts                 cn()
    lib/api/url.ts               buildUrl(base, path, origin)
    lib/api/url.test.ts
    lib/api/errors.ts            ApiError, toApiError(status, body)
    lib/api/errors.test.ts
    lib/api/client.ts            api (openapi-fetch client typed with the gateway schema)
    lib/api/client.test.ts
    lib/api/schema.d.ts          generated from the gateway's OpenAPI file (committed)
    components/not-found.tsx
    components/ui/button.tsx
    components/ui/button.test.tsx
    styles/tokens.css            Tailwind import + design tokens
    test/setup.ts                jest-dom, MSW lifecycle, cleanup
    test/msw.ts                  shared MSW server
    test/render.tsx              renderWithQuery(ui)
```

---

### Task 1: Project skeleton, toolchain and config module

**Files:**
- Create: `.gitignore`, `.node-version`, `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`,
  `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `src/main.tsx`, `src/config.ts`,
  `src/test/setup.ts`, `src/test/msw.ts`
- Test: `src/config.test.ts`

**Interfaces:**
- Produces: `PRODUCT_NAME: string`, `readConfig(env: Record<string, string | undefined>): AppConfig`,
  `type AppConfig = { productName: string; apiBaseUrl: string }`, `config: AppConfig` (from `src/config.ts`);
  `server` (MSW `SetupServerApi`) from `src/test/msw.ts`; the npm scripts `dev`, `build`, `preview`, `typecheck`,
  `lint`, `test`, `test:watch`, `e2e`, `api:types`.

- [ ] **Step 1: Check out develop and create the base files**

```bash
cd refactor/rwlabs_operator_web
git checkout develop
```

`.gitignore`:
```
node_modules
dist
*.local
.env
.env.*
!.env.example
playwright-report
test-results
.DS_Store
```

`.node-version`:
```
24
```

`package.json`:
```json
{
  "name": "rwlabs-operator-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "api:types": "openapi-typescript ../thirtyplus_gateway/docs/openapi/generated/openapi.yaml -o src/lib/api/schema.d.ts"
  }
}
```

- [ ] **Step 2: Install pinned dependencies**

```bash
npm install -E react@19.3.0 react-dom@19.3.0 @tanstack/react-router@1.170.42 @tanstack/react-query@5.104.2 \
  openapi-fetch@0.17.0 class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@3.7.0 @radix-ui/react-slot@1.5.0

npm install -E -D vite@8.3.4 @vitejs/plugin-react@6.1.2 typescript@5.9.3 @types/react@19 @types/react-dom@19 \
  @types/node@24.19.2 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 tw-animate-css@1.4.0 \
  @tanstack/router-plugin@1.168.43 openapi-typescript@7.13.0 \
  vitest@4.1.11 jsdom@27.4.0 @testing-library/react@16.3.3 @testing-library/jest-dom@6.10.0 \
  @testing-library/user-event@14.6.7 msw@2.15.0 @playwright/test@1.64.0 \
  eslint@9.39.5 @eslint/js@9.39.5 typescript-eslint@8.71.1 eslint-plugin-react-hooks@7.1.1 \
  eslint-plugin-react-refresh@0.5.7 globals@17.13.0
```

Expected: both commands finish without `ERESOLVE` peer-dependency errors. If one appears, stop and report it rather
than using `--force` or `--legacy-peer-deps`.

- [ ] **Step 3: TypeScript and Vite config**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "types": ["node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts", "vite.proxy.ts", "vite.proxy.test.ts", "playwright.config.ts", "e2e"]
}
```

`vite.config.ts` (Task 2 adds the proxy; Tasks 3 and 5 add plugins):
```ts
/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 3020, strictPort: true },
  preview: { port: 3020, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'vite.proxy.test.ts'],
  },
})
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Operator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`eslint.config.js`:
```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist', 'src/routeTree.gen.ts', 'src/lib/api/schema.d.ts', 'playwright-report', 'test-results'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true, allowExportNames: ['Route', 'buttonVariants'] },
      ],
    },
  },
)
```

- [ ] **Step 4: Test setup with MSW**

`src/test/msw.ts`:
```ts
import { setupServer } from 'msw/node'

// Shared MSW server. Tests add handlers with server.use(...); unhandled requests fail the test.
export const server = setupServer()
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
```

- [ ] **Step 5: Write the failing config test**

`src/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { PRODUCT_NAME, readConfig } from './config'

describe('readConfig', () => {
  it('uses the product name constant', () => {
    expect(readConfig({}).productName).toBe(PRODUCT_NAME)
    expect(PRODUCT_NAME).toBe('RWLabs')
  })

  it('defaults the API base URL to same-origin (empty string)', () => {
    expect(readConfig({}).apiBaseUrl).toBe('')
  })

  it('keeps a configured API base URL', () => {
    expect(readConfig({ VITE_API_BASE_URL: 'https://api.example.test' }).apiBaseUrl).toBe('https://api.example.test')
  })

  it('strips trailing slashes so paths never get a double slash', () => {
    expect(readConfig({ VITE_API_BASE_URL: 'https://api.example.test//' }).apiBaseUrl).toBe('https://api.example.test')
  })

  it('treats a whitespace-only value as unset', () => {
    expect(readConfig({ VITE_API_BASE_URL: '  ' }).apiBaseUrl).toBe('')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL, cannot resolve `./config`.

- [ ] **Step 7: Implement config and a minimal entry point**

`src/config.ts`:
```ts
// The product will be renamed; this is the only place the name lives.
export const PRODUCT_NAME = 'RWLabs'

export type AppConfig = {
  productName: string
  // Prefix for every API URL. Empty = same origin as the page (the default: nginx or the Vite proxy forwards
  // API paths to the gateway). Set VITE_API_BASE_URL to call the gateway cross-origin instead.
  apiBaseUrl: string
}

export function readConfig(env: Record<string, string | undefined>): AppConfig {
  return {
    productName: PRODUCT_NAME,
    apiBaseUrl: (env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, ''),
  }
}

export const config = readConfig(import.meta.env)
```

`src/main.tsx` (replaced in Task 5):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { config } from './config'

document.title = `${config.productName} Operator`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p>{config.productName} Operator</p>
  </StrictMode>,
)
```

- [ ] **Step 8: Run all checks**

```bash
npx vitest run src/config.test.ts   # Expected: 5 passed
npm run typecheck                   # Expected: no output, exit 0
npm run lint                        # Expected: exit 0
npm run build                       # Expected: dist/ created, exit 0
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Scaffold Vite + React + TS project with config module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dev proxy to the gateway

**Files:**
- Create: `vite.proxy.ts`
- Modify: `vite.config.ts`
- Test: `vite.proxy.test.ts`

**Interfaces:**
- Consumes: `vite.config.ts` from Task 1.
- Produces: `GATEWAY_PATHS: readonly string[]`, `DEFAULT_GATEWAY_URL = 'http://localhost:3000'`,
  `gatewayProxy(target?: string): Record<string, { target: string; changeOrigin: true }>`.

- [ ] **Step 1: Write the failing test**

`vite.proxy.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_GATEWAY_URL, GATEWAY_PATHS, gatewayProxy } from './vite.proxy'

describe('gatewayProxy', () => {
  it('proxies exactly the gateway paths nginx proxies', () => {
    expect(Object.keys(gatewayProxy())).toEqual(['/auth/api/', '/operator/api/', '^/health$'])
    expect(GATEWAY_PATHS).toEqual(['/auth/api/', '/operator/api/', '^/health$'])
  })

  it('targets the local gateway by default, rewriting the Host header', () => {
    for (const rule of Object.values(gatewayProxy())) {
      expect(rule).toEqual({ target: DEFAULT_GATEWAY_URL, changeOrigin: true })
    }
    expect(DEFAULT_GATEWAY_URL).toBe('http://localhost:3000')
  })

  it('uses a configured target, e.g. the staging gateway', () => {
    expect(gatewayProxy('http://10.0.0.135:3000')['/operator/api/'].target).toBe('http://10.0.0.135:3000')
  })

  it('falls back to the default for an empty target', () => {
    expect(gatewayProxy('')['/auth/api/'].target).toBe(DEFAULT_GATEWAY_URL)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run vite.proxy.test.ts`
Expected: FAIL, cannot resolve `./vite.proxy`.

- [ ] **Step 3: Implement**

`vite.proxy.ts`:
```ts
// Paths the dev server forwards to the gateway. Keep in sync with nginx/default.conf.template.
// Keys starting with ^ are regexes in Vite's proxy config: /health must match exactly, not /healthcheck etc.
export const GATEWAY_PATHS = ['/auth/api/', '/operator/api/', '^/health$'] as const

export const DEFAULT_GATEWAY_URL = 'http://localhost:3000'

export function gatewayProxy(target?: string) {
  const resolved = target || DEFAULT_GATEWAY_URL
  return Object.fromEntries(GATEWAY_PATHS.map((path) => [path, { target: resolved, changeOrigin: true as const }]))
}
```

Replace `vite.config.ts` with:
```ts
/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { gatewayProxy } from './vite.proxy'

export default defineConfig(({ mode }) => {
  // VITE_GATEWAY_URL: where the dev/preview server forwards API calls (default http://localhost:3000).
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = gatewayProxy(env.VITE_GATEWAY_URL)

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 3020, strictPort: true, proxy },
    preview: { port: 3020, strictPort: true, proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'vite.proxy.test.ts'],
    },
  }
})
```

- [ ] **Step 4: Run tests and checks**

```bash
npx vitest run vite.proxy.test.ts   # Expected: 4 passed
npm test && npm run typecheck && npm run lint
```

- [ ] **Step 5: Check the proxy and the port rule by hand**

```bash
npm run dev &                                      # starts on 3020
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3020/health
# Expected: 200 or 503 if a local gateway runs on :3000; 500/502/504 if none does (the proxy tried, the gateway wasn't there).
npx vite --port 3020 --strictPort 2>&1 | head -5
# Expected: an error that port 3020 is already in use. It must NOT start on 3021.
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Proxy gateway paths from the Vite dev server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tailwind 4, design tokens and the shadcn Button

**Files:**
- Create: `src/styles/tokens.css`, `src/lib/utils.ts`, `src/components/ui/button.tsx`, `components.json`
- Modify: `vite.config.ts` (add the Tailwind plugin), `src/main.tsx` (import the CSS)
- Test: `src/components/ui/button.test.tsx`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils`;
  `Button(props: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean })` and
  `buttonVariants` from `@/components/ui/button` (variants `default | outline | ghost`, sizes `default | sm | lg`).
  Token utility classes: `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `text-muted-foreground`,
  `bg-muted`, `border-border`, `text-destructive`, `bg-accent`, `ring-ring`.

- [ ] **Step 1: Write the failing test**

`src/components/ui/button.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('renders an accessible button that handles clicks', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Check again</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('applies variant classes from tokens, not raw colours', () => {
    render(<Button variant="outline">Outline</Button>)
    const button = screen.getByRole('button', { name: 'Outline' })
    expect(button.className).toContain('border-input')
    expect(button.className).not.toMatch(/#[0-9a-f]{3,6}|oklch\(/i)
  })

  it('renders its child element when asChild is set', () => {
    render(
      <Button asChild>
        <a href="/">Home</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('data-slot', 'button')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/button.test.tsx`
Expected: FAIL, cannot resolve `./button`.

- [ ] **Step 3: Implement tokens, `cn`, Button and shadcn config**

`src/styles/tokens.css`:
```css
@import 'tailwindcss';
@import 'tw-animate-css';

/*
 * Design tokens. Placeholder values: shadcn/ui's neutral palette, until the real palette and visual guidelines
 * arrive. Components use only the semantic utilities these produce (bg-background, text-muted-foreground, ...),
 * so the palette change happens here and nowhere else.
 */
:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}
```

`src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

`src/components/ui/button.tsx`:
```tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-10 px-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
```

`components.json` (lets `npx shadcn@3.8.5 add <component>` and 21st.dev registry URLs install into the right places):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/tokens.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

In `vite.config.ts`, add `import tailwindcss from '@tailwindcss/vite'` and change the plugins line to
`plugins: [react(), tailwindcss()],`.

In `src/main.tsx`, add `import './styles/tokens.css'` as the first import.

- [ ] **Step 4: Run tests and checks**

```bash
npx vitest run src/components/ui/button.test.tsx   # Expected: 3 passed
npm test && npm run typecheck && npm run lint && npm run build
ls dist/assets/*.css                                # Expected: one CSS file
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Tailwind 4, placeholder design tokens and shadcn Button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API layer skeleton (URLs, errors, typed client)

**Files:**
- Create: `src/lib/api/url.ts`, `src/lib/api/errors.ts`, `src/lib/api/client.ts`, `src/lib/api/schema.d.ts` (generated)
- Test: `src/lib/api/url.test.ts`, `src/lib/api/errors.test.ts`, `src/lib/api/client.test.ts`

**Interfaces:**
- Consumes: `config.apiBaseUrl` from `src/config.ts`; `server` from `src/test/msw.ts`.
- Produces:
  - `buildUrl(path: string, base?: string, origin?: string): string`. Defaults: `base = config.apiBaseUrl`,
    `origin = window.location.origin`. Returns an absolute URL. Throws `Error` if `path` doesn't start with `/`.
  - `class ApiError extends Error { readonly status: number }`
  - `toApiError(status: number, body: unknown): ApiError`
  - `api`: an `openapi-fetch` client typed with `paths` from `./schema`.

- [ ] **Step 1: Write the failing tests**

`src/lib/api/url.test.ts`:
```ts
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
```

`src/lib/api/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ApiError, toApiError } from './errors'

describe('toApiError', () => {
  it('reads the presentable error envelope', () => {
    const error = toApiError(422, { error: { message: "Name can't be blank", status: 422 }, success: false })
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.message).toBe("Name can't be blank")
  })

  it('reads a plain string body (presentable admin validation errors)', () => {
    expect(toApiError(422, 'Name is too long').message).toBe('Name is too long')
  })

  it('falls back to a generic message for anything else', () => {
    expect(toApiError(502, '').message).toBe('Request failed (502)')
    expect(toApiError(500, null).message).toBe('Request failed (500)')
    expect(toApiError(500, { error: { message: '' } }).message).toBe('Request failed (500)')
    expect(toApiError(500, { error: 'boom' }).message).toBe('Request failed (500)')
  })

  it('does not show an HTML error page as a message', () => {
    expect(toApiError(502, '<html><body>Bad Gateway</body></html>').message).toBe('Request failed (502)')
  })
})
```

`src/lib/api/client.test.ts`:
```ts
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { api } from './client'

describe('api client', () => {
  it('sends typed requests to the same origin by default', async () => {
    let requestedUrl = ''
    server.use(
      http.get('*/auth/api/me', ({ request }) => {
        requestedUrl = request.url
        return HttpResponse.json({ data: {}, success: true })
      }),
    )

    const { response } = await api.GET('/auth/api/me')

    expect(response.status).toBe(200)
    expect(requestedUrl).toBe(`${window.location.origin}/auth/api/me`)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/api`
Expected: FAIL, cannot resolve `./url`, `./errors`, `./client`.

- [ ] **Step 3: Generate the API types**

```bash
npm run api:types
grep -c '"/operator/api' src/lib/api/schema.d.ts
```
Expected: `schema.d.ts` written; the count is greater than 0 (21 at the time of writing).

- [ ] **Step 4: Implement**

`src/lib/api/url.ts`:
```ts
import { config } from '@/config'

// Every API URL is built here, so switching between same-origin (nginx / Vite proxy) and a cross-origin gateway
// is just VITE_API_BASE_URL. Always returns an absolute URL (fetch in tests has no page to resolve against).
export function buildUrl(path: string, base: string = config.apiBaseUrl, origin: string = window.location.origin) {
  if (!path.startsWith('/')) throw new Error(`API path must start with "/": ${path}`)
  return `${base || origin}${path}`
}
```

`src/lib/api/errors.ts`:
```ts
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function envelopeMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined
  const { error } = body as { error: unknown }
  if (typeof error !== 'object' || error === null || !('message' in error)) return undefined
  const { message } = error as { message: unknown }
  return typeof message === 'string' && message.trim() ? message : undefined
}

// Turns any error response body into an ApiError. Understands the presentable gem's envelope
// ({ error: { message, status }, success: false }) and its plain-string admin validation errors.
export function toApiError(status: number, body: unknown): ApiError {
  const fromEnvelope = envelopeMessage(body)
  if (fromEnvelope) return new ApiError(status, fromEnvelope)
  if (typeof body === 'string' && body.trim() && !body.trimStart().startsWith('<')) {
    return new ApiError(status, body.trim())
  }
  return new ApiError(status, `Request failed (${status})`)
}
```

`src/lib/api/client.ts`:
```ts
import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { buildUrl } from './url'

// Typed client for the gateway. Regenerate the types with `npm run api:types` when the gateway's OpenAPI changes.
// The base is resolved once at module load via buildUrl, so tests and the browser both get absolute URLs.
export const api = createClient<paths>({ baseUrl: buildUrl('/').replace(/\/$/, '') })
```

- [ ] **Step 5: Run tests and checks**

```bash
npx vitest run src/lib/api   # Expected: all pass (5 + 4 + 1)
npm test && npm run typecheck && npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add API layer skeleton: URL builder, ApiError, typed gateway client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Router, gateway health and the Hello World page

**Files:**
- Create: `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routeTree.gen.ts` (generated),
  `src/components/not-found.tsx`, `src/features/health/api.ts`, `src/features/health/health-status.tsx`,
  `src/features/hello/hello-page.tsx`, `src/test/render.tsx`
- Modify: `vite.config.ts` (router plugin), `src/main.tsx` (providers + router)
- Test: `src/features/health/api.test.ts`, `src/features/health/health-status.test.tsx`,
  `src/features/hello/hello-page.test.tsx`

**Interfaces:**
- Consumes: `buildUrl` (Task 4), `Button` (Task 3), `config` (Task 1), `server` (Task 1).
- Produces:
  - `type GatewayHealth = 'ok' | 'degraded' | 'unreachable'`
  - `fetchGatewayHealth(): Promise<GatewayHealth>` (never rejects)
  - `gatewayHealthQuery` (TanStack `queryOptions`, key `['gateway-health']`)
  - `HealthStatus()`, `HelloPage()`, `NotFound()` components
  - `createAppRouter(queryClient: QueryClient)`; router context type `{ queryClient: QueryClient }`
  - `renderWithQuery(ui: React.ReactElement)` test helper

- [ ] **Step 1: Write the test helper and the failing tests**

`src/test/render.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

// Fresh QueryClient per test, no retries, so failures show up immediately.
export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}
```

`src/features/health/api.test.ts`:
```ts
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { fetchGatewayHealth } from './api'

describe('fetchGatewayHealth', () => {
  it('is ok when the gateway reports ok', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    await expect(fetchGatewayHealth()).resolves.toBe('ok')
  })

  it('is degraded when the gateway answers 503 degraded', async () => {
    server.use(
      http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'degraded' }, { status: 503 })),
    )
    await expect(fetchGatewayHealth()).resolves.toBe('degraded')
  })

  it('is unreachable on a network error', async () => {
    server.use(http.get('*/health', () => HttpResponse.error()))
    await expect(fetchGatewayHealth()).resolves.toBe('unreachable')
  })

  it('is unreachable when a proxy returns an HTML error page', async () => {
    server.use(http.get('*/health', () => HttpResponse.html('<html>502 Bad Gateway</html>', { status: 502 })))
    await expect(fetchGatewayHealth()).resolves.toBe('unreachable')
  })

  it('is unreachable when the body is JSON but not a gateway health report', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ hello: 'world' })))
    await expect(fetchGatewayHealth()).resolves.toBe('unreachable')
  })

  it('is unreachable on an empty error response (the Vite proxy with no gateway running)', async () => {
    server.use(http.get('*/health', () => new HttpResponse(null, { status: 500 })))
    await expect(fetchGatewayHealth()).resolves.toBe('unreachable')
  })
})
```

`src/features/health/health-status.test.tsx`:
```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw'
import { renderWithQuery } from '@/test/render'
import { HealthStatus } from './health-status'

describe('HealthStatus', () => {
  it('says it is checking while the request is in flight', () => {
    server.use(http.get('*/health', () => new Promise(() => {})))
    renderWithQuery(<HealthStatus />)
    expect(screen.getByRole('status')).toHaveTextContent('Checking the gateway')
  })

  it('reports a healthy gateway', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    renderWithQuery(<HealthStatus />)
    expect(await screen.findByText('Gateway reachable. All services are healthy.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument()
  })

  it('reports a degraded gateway with a way to check again', async () => {
    server.use(
      http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'degraded' }, { status: 503 })),
    )
    renderWithQuery(<HealthStatus />)
    expect(
      await screen.findByText("The gateway is up, but a service behind it isn't healthy."),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument()
  })

  it('reports an unreachable gateway and recovers when checked again', async () => {
    server.use(http.get('*/health', () => HttpResponse.error()))
    renderWithQuery(<HealthStatus />)
    expect(await screen.findByText("Can't reach the gateway.")).toBeInTheDocument()

    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))

    expect(await screen.findByText('Gateway reachable. All services are healthy.')).toBeInTheDocument()
  })
})
```

`src/features/hello/hello-page.test.tsx`:
```tsx
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { PRODUCT_NAME } from '@/config'
import { server } from '@/test/msw'
import { renderWithQuery } from '@/test/render'
import { HelloPage } from './hello-page'

describe('HelloPage', () => {
  it('greets with the product name and shows the gateway status', async () => {
    server.use(http.get('*/health', () => HttpResponse.json({ service: 'gateway', status: 'ok' })))
    renderWithQuery(<HelloPage />)
    expect(screen.getByRole('heading', { level: 1, name: `${PRODUCT_NAME} Operator` })).toBeInTheDocument()
    expect(screen.getByText('Hello world. The operator panel is running.')).toBeInTheDocument()
    expect(await screen.findByText('Gateway reachable. All services are healthy.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features`
Expected: FAIL, cannot resolve `./api`, `./health-status`, `./hello-page`.

- [ ] **Step 3: Implement the health feature and the page**

`src/features/health/api.ts`:
```ts
import { queryOptions } from '@tanstack/react-query'
import { buildUrl } from '@/lib/api/url'

export type GatewayHealth = 'ok' | 'degraded' | 'unreachable'

// GET /health is the gateway's own endpoint (not the presentable envelope): { service, status: 'ok' | 'degraded' },
// HTTP 200 or 503. Anything else (network error, a proxy's HTML error page, an empty body) means we didn't reach it.
// Never rejects, so the UI always has a state to show.
export async function fetchGatewayHealth(): Promise<GatewayHealth> {
  try {
    const response = await fetch(buildUrl('/health'), { headers: { Accept: 'application/json' } })
    const body: unknown = await response.json().catch(() => null)
    if (typeof body !== 'object' || body === null || !('status' in body)) return 'unreachable'
    if (body.status === 'ok' && response.ok) return 'ok'
    if (body.status === 'degraded') return 'degraded'
    return 'unreachable'
  } catch {
    return 'unreachable'
  }
}

export const gatewayHealthQuery = queryOptions({
  queryKey: ['gateway-health'],
  queryFn: fetchGatewayHealth,
})
```

`src/features/health/health-status.tsx`:
```tsx
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { gatewayHealthQuery } from './api'

const MESSAGES = {
  ok: 'Gateway reachable. All services are healthy.',
  degraded: "The gateway is up, but a service behind it isn't healthy.",
  unreachable: "Can't reach the gateway.",
} as const

const HINTS = {
  degraded: "Open the gateway's /health for the breakdown.",
  unreachable: 'Locally, check the gateway is running on port 3000. In staging, check the gateway container is up.',
} as const

export function HealthStatus() {
  const { data, isPending, isFetching, refetch } = useQuery(gatewayHealthQuery)

  if (isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Checking the gateway…
      </p>
    )
  }

  // fetchGatewayHealth never rejects, but the query type still allows an error state with no data.
  const health = data ?? 'unreachable'

  return (
    <div role="status" className="space-y-3">
      <p className={health === 'ok' ? 'text-sm' : 'text-sm text-destructive'}>{MESSAGES[health]}</p>
      {health !== 'ok' && (
        <>
          <p className="text-sm text-muted-foreground">{HINTS[health]}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            Check again
          </Button>
        </>
      )}
    </div>
  )
}
```

`src/features/hello/hello-page.tsx`:
```tsx
import { config } from '@/config'
import { HealthStatus } from '@/features/health/health-status'

export function HelloPage() {
  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">{config.productName} Operator</h1>
      <p className="text-muted-foreground">Hello world. The operator panel is running.</p>
      <HealthStatus />
    </main>
  )
}
```

`src/components/not-found.tsx`:
```tsx
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <main className="mx-auto max-w-xl space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">This page doesn't exist.</h1>
      <p className="text-muted-foreground">Check the address, or go back to the start page.</p>
      <Button asChild variant="outline">
        <Link to="/">Go to the start page</Link>
      </Button>
    </main>
  )
}
```

- [ ] **Step 4: Run the feature tests**

Run: `npx vitest run src/features`
Expected: all pass (6 + 4 + 1).

- [ ] **Step 5: Wire up the router**

In `vite.config.ts`, add `import { tanstackRouter } from '@tanstack/router-plugin/vite'` and change the plugins line to
`plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],`
(the router plugin must come before `react()`).

`src/routes/__root.tsx`:
```tsx
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { NotFound } from '@/components/not-found'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => <Outlet />,
  notFoundComponent: NotFound,
})
```

`src/routes/index.tsx`:
```tsx
import { createFileRoute } from '@tanstack/react-router'
import { HelloPage } from '@/features/hello/hello-page'

export const Route = createFileRoute('/')({
  component: HelloPage,
})
```

`src/router.tsx`:
```tsx
import type { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent' })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
```

Replace `src/main.tsx`:
```tsx
import './styles/tokens.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { config } from './config'
import { createAppRouter } from './router'

document.title = `${config.productName} Operator`

const queryClient = new QueryClient()
const router = createAppRouter(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 6: Generate the route tree and run all checks**

```bash
npx vite build                     # the router plugin writes src/routeTree.gen.ts (tsc -b would fail without it)
ls src/routeTree.gen.ts            # Expected: exists
npm run build && npm test && npm run typecheck && npm run lint
```

- [ ] **Step 7: Look at it**

```bash
npm run dev
```
Open http://localhost:3020. Expected: "RWLabs Operator", the hello line, and either "Gateway reachable…" (local
gateway running) or "Can't reach the gateway." with a Check again button. Open http://localhost:3020/t/leads/42.
Expected: "This page doesn't exist." with a working link back. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add router and Hello World page with gateway health status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end smoke tests (Playwright)

**Files:**
- Create: `playwright.config.ts`, `e2e/hello.spec.ts`

**Interfaces:**
- Consumes: the dev server on 3020 (Tasks 1–2), the page texts from Task 5.
- Produces: `npm run e2e`.

- [ ] **Step 1: Write the config and the failing test**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'

// The tests mock /health in the browser, so no gateway or Rails services need to be running.
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3020' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3020',
    reuseExistingServer: !process.env.CI,
  },
})
```

`e2e/hello.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

test('the start page greets and shows a healthy gateway', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { service: 'gateway', status: 'ok' } }))
  await page.goto('/')
  await expect(page).toHaveTitle('RWLabs Operator')
  await expect(page.getByRole('heading', { level: 1, name: 'RWLabs Operator' })).toBeVisible()
  await expect(page.getByText('Gateway reachable. All services are healthy.')).toBeVisible()
})

test('the start page explains an unreachable gateway', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>' }))
  await page.goto('/')
  await expect(page.getByText("Can't reach the gateway.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible()
})

test('an unknown deep link shows the not-found page', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { service: 'gateway', status: 'ok' } }))
  await page.goto('/t/leads/42')
  await expect(page.getByRole('heading', { name: "This page doesn't exist." })).toBeVisible()
  await page.getByRole('link', { name: 'Go to the start page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'RWLabs Operator' })).toBeVisible()
})
```

- [ ] **Step 2: Install the browser and run**

```bash
npx playwright install chromium
npm run e2e
```
Expected: 3 passed. (These pass immediately because Task 5 built the behaviour; this task adds the browser-level
guard. To see one fail, temporarily change the expected heading text, run, then revert.)

- [ ] **Step 3: Checks and commit**

```bash
npm run typecheck && npm run lint
git add -A
git commit -m "Add Playwright smoke tests for the start and not-found pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docker image with nginx (static files + gateway proxy)

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `nginx/default.conf.template`

**Interfaces:**
- Consumes: `npm run build` output in `dist/`.
- Produces: an image serving on port 80. Env: `GATEWAY_UPSTREAM` (default `http://gateway:3000`),
  `GATEWAY_HOST_HEADER` (default `localhost:3000`).

- [ ] **Step 1: Write the files**

`.dockerignore`:
```
node_modules
dist
.git
playwright-report
test-results
.env
.env.*
docs
```

`Dockerfile`:
```dockerfile
# Build: Node compiles the static app into dist/.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime: nginx only (no Node). Serves dist/ and proxies API paths to the gateway.
FROM nginx:1.28-alpine
# Where API calls go, and the Host header the gateway expects (staging's gateway only accepts localhost and
# 10.0.0.0/24 hosts until OS-29). NGINX_ENTRYPOINT_LOCAL_RESOLVERS makes the image's entrypoint export
# NGINX_LOCAL_RESOLVERS from /etc/resolv.conf, so the gateway's address is re-resolved after it is recreated.
ENV GATEWAY_UPSTREAM=http://gateway:3000 \
    GATEWAY_HOST_HEADER=localhost:3000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

`nginx/default.conf.template` (the image's entrypoint substitutes `${...}` env vars; nginx's own `$vars` are left
alone because they aren't set in the environment):
```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # Resolve the gateway's name per request (cached 10s) instead of once at startup, so recreating the gateway
    # container (new IP) doesn't break the panel. A variable in proxy_pass is what forces runtime resolution.
    resolver ${NGINX_LOCAL_RESOLVERS} valid=10s ipv6=off;
    set $gateway_upstream ${GATEWAY_UPSTREAM};

    # API paths -> gateway. Same list as vite.proxy.ts.
    location ~ ^/(auth/api/|operator/api/|health$) {
        proxy_pass $gateway_upstream;
        proxy_set_header Host ${GATEWAY_HOST_HEADER};
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20m;   # CSV lead imports
    }

    # Hashed build assets: cache forever. A missing one is a real 404, never index.html (a tab left open across a
    # deploy asks for old chunk names; serving HTML as JS gives a confusing MIME error instead of a clean failure).
    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Everything else is the SPA: real files if they exist, otherwise index.html so client routes survive a refresh.
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

- [ ] **Step 2: Build the image**

```bash
docker build -t rwlabs-operator-web:local .
```
Expected: build succeeds (the build stage runs `npm ci` and `npm run build`).

- [ ] **Step 3: Check static serving, SPA fallback and caching**

```bash
docker run -d --name owc-test -p 3021:80 -e GATEWAY_UPSTREAM=http://host.docker.internal:3000 rwlabs-operator-web:local
sleep 2
curl -s http://localhost:3021/ | grep -c '<div id="root">'                         # Expected: 1
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3021/t/leads/42          # Expected: 200
curl -s http://localhost:3021/t/leads/42 | grep -c '<div id="root">'               # Expected: 1
curl -sI http://localhost:3021/ | grep -i '^cache-control'                         # Expected: no-cache
ASSET=$(curl -s http://localhost:3021/ | grep -o '/assets/[^"]*\.js' | head -1)
curl -sI "http://localhost:3021$ASSET" | grep -i '^cache-control'                  # Expected: ... immutable
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3021/assets/old-chunk-123.js   # Expected: 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3021/health
# Expected: 200/503 with a local gateway on :3000, otherwise 502 (proxy tried, nothing there).
docker rm -f owc-test
```

- [ ] **Step 4: Check the proxy survives the gateway being recreated**

A throwaway "gateway" on a private Docker network stands in for the real one. Python's http.server answers
`/health` with its own 404 page, which is enough to prove the request reached it (nginx's failure would be 502).

```bash
docker network create owc-net
docker run -d --name gateway --network owc-net python:3.13-alpine python -m http.server 3000
docker run -d --name owc-test --network owc-net -p 3021:80 rwlabs-operator-web:local
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3021/health    # Expected: 404 (reached the stub)
curl -s http://localhost:3021/health | grep -c 'Error response'           # Expected: 1

# Recreate the stub with a different IP: the placeholder grabs the freed address first.
docker rm -f gateway
docker run -d --name placeholder --network owc-net alpine sleep 300
docker run -d --name gateway --network owc-net python:3.13-alpine python -m http.server 3000
sleep 12                                                                   # past the 10s resolver cache
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3021/health    # Expected: 404 again, not 502

docker rm -f owc-test gateway placeholder && docker network rm owc-net
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Docker image: nginx serving the SPA and proxying API paths to the gateway

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wire into the workspace, and document the repo

**Files:**
- Create: `README.md`, `CLAUDE.md` (in the repo)
- Modify (uncommitted, `refactor/` is not a repo): `refactor/docker-compose.yml`, `refactor/deploy.sh`,
  `refactor/scripts/start-all-services.sh`, `refactor/scripts/close-all-services.sh`, `refactor/CLAUDE.md`

**Interfaces:**
- Consumes: the image from Task 7; `npm run dev` from Tasks 1–2.
- Produces: a `panel` compose service published on host port 3020; `./deploy.sh panel`; the panel in the local
  start/stop scripts.

- [ ] **Step 1: Add the `panel` service to `refactor/docker-compose.yml`**

In the header comment's directory tree, after the `rwlabs_meta_service/` line, add:
```
#   └── rwlabs_operator_web/       git clone -b develop raunjon/rwlabs-operator-web
```
and change the meta line's `└──` to `├──`.

Insert this service immediately before the `tunnel:` service:
```yaml
  # Operator web panel: nginx serving the built SPA and proxying /auth/api, /operator/api and /health to the
  # gateway (see rwlabs_operator_web/nginx/default.conf.template). The tunnel's public hostname points here.
  panel:
    restart: unless-stopped
    build: ./rwlabs_operator_web
    image: rwlabs-staging/panel
    environment:
      GATEWAY_UPSTREAM: http://gateway:3000
      GATEWAY_HOST_HEADER: localhost:3000
    ports:
      - "3020:80"
    depends_on:
      - gateway
```

Replace the tunnel's comment lines that start with `# Public hostname's service:` through `# Staging rejects unknown
hostnames otherwise (until OS-29 is done).` with:
```yaml
  # Public hostname's service: http://panel:80. The panel's nginx sets the Host header the gateway needs
  # (localhost:3000, until OS-29), so the tunnel no longer needs an HTTP Host Header override.
```
and change the tunnel's `depends_on` from `- gateway` to `- panel`.

- [ ] **Step 2: Add `panel` to `refactor/deploy.sh`**

Make exactly these edits (the usage text is printed from lines 2–12, so don't add or remove comment lines):
- Line `# Services: auth, gateway, operator, meta. auth and operator also restart` →
  `# Services: auth, gateway, operator, meta, panel. auth and operator also restart`
- `ALL=(auth gateway operator meta)` → `ALL=(auth gateway operator meta panel)`
- In `repo_for`, add a case: `    panel) echo rwlabs_operator_web ;;`
- In the argument loop: `auth|gateway|operator|meta) services+=("$arg") ;;` →
  `auth|gateway|operator|meta|panel) services+=("$arg") ;;`
- Replace the health-check block (from `# Rails needs a few seconds to boot` to the end of the file) with:

```bash
# Rails needs a few seconds to boot; the gateway's /health also checks auth and operator. When the panel was
# deployed, check through it instead: one request proves nginx, its proxy, the gateway and the services.
health_url=http://localhost:3000/health
health_name="the gateway's"
if printf '%s\n' "${services[@]}" | grep -qx panel; then
  health_url=http://localhost:3020/health
  health_name="the panel's (via the gateway)"
fi

echo "==> Waiting for $health_name health check"
for _ in $(seq 1 30); do
  if health=$(curl -fsS -m 5 "$health_url" 2>/dev/null); then
    echo "    ok: $health" | cut -c1-200
    docker compose ps --format "table {{.Service}}\t{{.Status}}"
    exit 0
  fi
  sleep 3
done

echo "    Not healthy after 90s. Details:" >&2
curl -sS -m 5 "$health_url" >&2 || true
echo >&2
docker compose ps --format "table {{.Service}}\t{{.Status}}" >&2
echo "Logs: docker compose logs --tail=50 <service>" >&2
exit 1
```

- [ ] **Step 3: Add the panel to the local start/stop scripts**

In `refactor/scripts/start-all-services.sh`, after the `start_service` function, add:
```bash
# The operator web panel is a Vite dev server, not Rails.
start_web_service() {
    local service_name=$1
    local service_dir=$2
    local port=$3
    local log_file="$LOGS_DIR/${service_name}.log"

    if check_port $port; then
        echo -e "${YELLOW}[${service_name}]${NC} Already running on port ${port}"
        return 0
    fi

    if [ ! -d "$service_dir/node_modules" ]; then
        echo -e "${RED}[${service_name}]${NC} Dependencies missing. Run: (cd $service_dir && npm install)"
        return 1
    fi

    echo -e "${BLUE}[${service_name}]${NC} Starting on port ${port}..."
    cd "$service_dir" || exit 1
    npm run dev > "$log_file" 2>&1 &
    local pid=$!
    echo $pid > "$LOGS_DIR/${service_name}.pid"

    sleep 2
    if ps -p $pid > /dev/null 2>&1; then
        echo -e "${GREEN}[${service_name}]${NC} Started successfully (PID: ${pid})"
        echo -e "                   Log: ${log_file}"
    else
        echo -e "${RED}[${service_name}]${NC} Failed to start! Check log: ${log_file}"
        return 1
    fi
}
```
After `start_service "Meta" ...`, add:
```bash
start_web_service "Panel" "$MICROSERVICES_DIR/rwlabs_operator_web" 3020
```
After the `echo -e "  Meta:     http://localhost:3010"` line, add:
```bash
echo -e "  Panel:    http://localhost:3020"
```

In `refactor/scripts/close-all-services.sh`:
- `SERVICE_NAMES=("Gateway" "Auth" "Operator" "Meta")` → `SERVICE_NAMES=("Gateway" "Auth" "Operator" "Meta" "Panel")`
- `PORTS=(3000 3001 3006 3010)` → `PORTS=(3000 3001 3006 3010 3020)`

(The stop script kills the PID, then anything still on the port, which catches Vite's child process.)

- [ ] **Step 4: Verify the workspace changes**

```bash
cd refactor
bash -n deploy.sh && bash -n scripts/start-all-services.sh && bash -n scripts/close-all-services.sh   # Expected: no output
docker compose config --services | sort      # Expected: includes panel (tunnel only appears with its profile)
./deploy.sh --dry-run --no-pull panel
# Expected: "+ docker compose up -d --build panel", then exit 0 (dry run skips the health check).
./deploy.sh --help | grep -c panel           # Expected: 1
./scripts/start-all-services.sh               # Expected: a "[Panel] Started successfully" line and the Panel URL
curl -s http://localhost:3020/ | grep -c '<div id="root">'    # Expected: 1
./scripts/close-all-services.sh               # Expected: "[Panel] ... Successfully stopped"
```

If `docker compose config` errors about a missing variable, that comes from the local `.env`, not this change.
Confirm the error names an `.env` variable (e.g. `Set DB_USERNAME in .env`) and report it instead of editing `.env`.

- [ ] **Step 5: Document the repo**

`README.md` (in the repo):
````markdown
# RWLabs Operator Web

The operator panel for the RWLabs multi-tenant platform: a Vite + React + TypeScript SPA that talks only to the
gateway (`thirtyplus_gateway`). Design: `docs/superpowers/specs/2026-10-12-operator-web-v1-design.md`.

## Run it

```bash
npm install
npm run dev          # http://localhost:3020, proxies /auth/api, /operator/api and /health to the gateway
```

The gateway is expected on `http://localhost:3000`. To use another one (e.g. staging), create `.env.local` with
`VITE_GATEWAY_URL=http://10.0.0.135:3000`.

## Checks

```bash
npm test             # Vitest (unit + component, MSW for HTTP)
npm run e2e          # Playwright (first time: npx playwright install chromium)
npm run typecheck
npm run lint
npm run build
```

## Staging

Built by the `panel` service in `refactor/docker-compose.yml` (`./deploy.sh panel`). The image is nginx serving
`dist/` and proxying the API paths to `GATEWAY_UPSTREAM`.
````

`CLAUDE.md` (in the repo):
```markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Operator panel SPA (Vite, React 19, TypeScript, TanStack Router + Query, Tailwind 4, shadcn/ui). Talks only to the
gateway. Design spec: `docs/superpowers/specs/2026-10-12-operator-web-v1-design.md`; plans in
`docs/superpowers/plans/`. Stay inside `refactor/` (see `../CLAUDE.md`).

## Commands

    npm run dev                      # :3020 (strictPort), proxies gateway paths to VITE_GATEWAY_URL (default :3000)
    npm test                         # all Vitest tests
    npx vitest run src/features/health/api.test.ts   # one file
    npx vitest run -t "recovers when checked again"  # one test by name
    npm run e2e                      # Playwright; mocks /health, needs no backend
    npm run typecheck && npm run lint && npm run build
    npm run api:types                # regenerate src/lib/api/schema.d.ts from the gateway's OpenAPI file

## Rules that aren't obvious from the code

- **One list of proxied paths** (`/auth/api/`, `/operator/api/`, `/health`) lives in two places that must match:
  `vite.proxy.ts` (dev) and `nginx/default.conf.template` (staging).
- **Every API URL goes through `buildUrl`** (`src/lib/api/url.ts`) or the `api` client. Never hand-build URLs or use
  `<a href>` for API downloads: the panel must be movable to its own host by setting `VITE_API_BASE_URL`.
- **Colours only via tokens** in `src/styles/tokens.css` (currently placeholder shadcn neutrals until the real palette
  arrives). No raw hex/oklch in components.
- **Product name** only in `src/config.ts` (`PRODUCT_NAME`).
- **Generated, committed files:** `src/routeTree.gen.ts` (TanStack Router plugin, rewritten on dev/build) and
  `src/lib/api/schema.d.ts` (`npm run api:types`; the Docker build can't see the gateway repo).
- **TypeScript stays on 5.9.x**: `openapi-typescript` needs `^5`, `typescript-eslint` needs `<6.1`.
- **Gateway responses** use the presentable envelope (`{ data, success, ... }` / `{ error: { message, status } }`);
  `toApiError` turns failures into `ApiError`. `/health` is the exception (its own `{ service, status }` shape).
- **21st.dev components:** install via the shadcn CLI, then replace `next/link`/`next/image`, move Tailwind 3 config
  into `@theme`, restyle to tokens, check keyboard access, and note the licence at the top of the file.
```

In `refactor/CLAUDE.md`, add this row to the repo table after the `rwlabs_meta_service/` row:
```
| `rwlabs_operator_web/` | `rwlabs-operator-web` | 3020 | — | Operator panel SPA (Vite/React). nginx in staging, proxying API paths to the gateway |
```
and change the sentence `Service repos work on \`develop\`; \`master\` is the default/release branch.` to
`Service repos and \`rwlabs_operator_web\` work on \`develop\`; \`master\` is the default/release branch.`

- [ ] **Step 6: Final full check and commit (repo files only)**

```bash
cd refactor/rwlabs_operator_web
npm test && npm run typecheck && npm run lint && npm run build && npm run e2e
git add README.md CLAUDE.md
git commit -m "Document how to run, test and deploy the panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git status --short    # Expected: clean
```

Report the uncommitted `refactor/` changes (compose, deploy.sh, scripts, CLAUDE.md) in the hand-off, plus the manual
step only Raunak can do: point the Cloudflare tunnel's public hostname at `http://panel:80` and remove its HTTP Host
Header override.
