# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Jira tickets:** when an `OW-xxx` ticket (or a thirtyplus.atlassian.net/browse/OW-xxx link) is shared, read and
> follow [`docs/instructions.md`](docs/instructions.md) **before doing anything else** (the `working-on-ow-ticket` skill).
> It covers the worktree question, branch naming, the checks to run, and raising the PR.

Operator panel SPA (Vite, React 19, TypeScript, TanStack Router + Query, Tailwind 4, shadcn/ui). Talks only to the
gateway. Design spec: `docs/superpowers/specs/2026-10-12-operator-web-v1-design.md`; plans in
`docs/superpowers/plans/`. Stay inside `refactor/` (see `../CLAUDE.md`). Work on `develop`. Code review guidance: `AGENTS.md`.

## Commands

    npm run dev                      # :3020 (strictPort), proxies gateway paths to VITE_GATEWAY_URL (default :3000)
    npm test                         # all Vitest tests
    npx vitest run src/features/health/api.test.ts   # one file
    npx vitest run -t "recovers when checked again"  # one test by name
    npm run e2e                      # Playwright; mocks /health, needs no backend
    npm run typecheck && npm run lint && npm run build
    npm run api:types                # regenerate src/lib/api/schema.d.ts from the gateway's OpenAPI file

`npm run dev` first runs `scripts/assert-port-free.ts` (predev): Vite's strictPort misses a conflict held on IPv4 on
macOS, so this refuses to start if anything answers on 127.0.0.1 or ::1 port 3020.

Locally the panel also starts/stops with `../scripts/start-all-services.sh` / `close-all-services.sh`.
Docker is staging/production only: don't build images locally.

## Rules that aren't obvious from the code

- **One list of proxied paths** (`/auth/api/`, `/operator/api/`, `/health`) lives in two places that must match:
  `vite.proxy.ts` (dev) and `nginx/default.conf.template` (staging/prod).
- **`/health` is split by the `Accept` header**: a browser opening it (asks for `text/html`) gets the System health
  page; everything else (the page's own fetch, curl, `deploy.sh`) is proxied to the gateway. Both proxy configs do
  this; keep them in step.
- **Every API URL goes through `buildUrl`** (`src/lib/api/url.ts`) or the `api` client. Never hand-build URLs or use
  `<a href>` for API downloads: the panel must be movable to its own host by setting `VITE_API_BASE_URL`.
- **The `api` client looks up `fetch` per call.** openapi-fetch otherwise captures the global fetch at import, which
  bypasses MSW in tests (requests then hit a real gateway on :3000).
- **Design system:** read [`docs/design-system.md`](docs/design-system.md) before UI work (tokens, contrast pairs,
  theme, components, checklist).
- **Colours only via tokens** in `src/styles/tokens.css`: the Figma palette (`--palette-*`, light and dark ramps) and the
  semantic tokens built from it (`bg-primary`, `text-success`, ...). Components use semantic tokens only; a test fails
  on any raw hex/rgb/oklch elsewhere in `src/`. Dark mode is the `dark` class on `<html>`, so components need no
  `dark:` variants. An inline script in `index.html` sets it before the first paint (no light flash while the app
  loads); `src/lib/theme.ts` takes over after. Keep the storage key and rules in step between the two. When a component puts a new token pair together, add it to
  `src/styles/contrast-pairs.ts`; `tokens.test.ts` holds every pair to WCAG AA in both modes. Review it all at
  `/style-guide`.
- **shadcn CLI resolves our `utils` alias wrongly**: `npx shadcn@3.8.5 add` writes `import { cn } from "cn"` and
  installs an unrelated npm package called `cn` (plus `radix-ui`). Uninstall both and import from `@/lib/utils`.
- **Product name** only in `src/config.ts` (`PRODUCT_NAME`).
- **Generated, committed files:** `src/routeTree.gen.ts` (TanStack Router plugin, rewritten on dev/build) and
  `src/lib/api/schema.d.ts` (`npm run api:types`; the Docker build can't see the gateway repo).
- **TypeScript stays on 5.9.x**: `openapi-typescript` needs `^5`, `typescript-eslint` needs `<6.1`.
- **npm 11.4 crashes resolving vitest's peers** ("reading 'edgesOut'"). If adding/upgrading test deps fails that way,
  run the install with `npx npm@12 install ...`; the lockfile stays compatible with npm 11's `npm ci`.
- **Session** (`src/lib/session/`): the gateway JWT is in `sessionStorage` (`session_jwt`) and the in-memory store
  only. Never copy it into React state, props, URLs or logs; `Session` deliberately has no token field, and only the
  API layer reads it via `sessionToken()`. Feature requests go through the `api` client, whose middleware adds
  `X-Jwt-Token` and ends the session on a 401. Sign-in/out (`src/features/auth/api.ts`) use `fetch` + `buildUrl`
  because the gateway's OpenAPI doesn't describe login's body or `?jwt=true`.
- **Routes:** signed-in pages live under `src/routes/_authenticated/` (guard + session watcher); `/t` is tenant
  admins only, `/admin` super admins only. `/login`, `/signup`, `/invitations/accept` (the path auth's invitation email links to), `/health` and `/style-guide` are public.
- **Internal pages** (`/style-guide`, `/health`) and their links (sidebar "Internal", login footer) exist only when
  `config.showInternalPages` is on: `npm run dev` and builds with `VITE_APP_ENV=staging` (the staging compose file
  passes it as a build arg). Any other build is production and serves them as not found.
- **Gateway responses** use the presentable envelope (`{ data, success, ... }` / `{ error: { message, status } }`);
  `toApiError` turns failures into `ApiError`. `/health` is the exception (its own `{ service, status }` shape).
- **21st.dev components:** install via the shadcn CLI, then replace `next/link`/`next/image`, move Tailwind 3 config
  into `@theme`, restyle to tokens, check keyboard access, and note the licence at the top of the file.
