# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Jira tickets:** when an `OW-xxx` ticket (or a thirtyplus.atlassian.net/browse/OW-xxx link) is shared, read and
> follow [`docs/instructions.md`](docs/instructions.md) **before doing anything else** (the `working-on-ow-ticket` skill).
> It covers the worktree question, branch naming, the checks to run, and raising the PR. Other repo skills in
> `.claude/skills/`: `writing-jira-tickets` (creating or splitting tickets) and `fable-mode` (how to work a task).

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

Don't run `npm test` at the same time as `npm run e2e` or a dev-server start: under that load the flow tests'
`findBy*` lookups hit their 1s timeout and look like real failures. Rerun the file alone before touching the test.

`.claude/launch.json` (git-ignored) is the Claude desktop app's browser-preview config: `web` runs `npm run dev`
on 3020 so the real page can be checked against the local gateway.

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
- **npm 11.4 can't resolve this tree.** It crashes on vitest's peers ("reading 'edgesOut'") and refuses new deps with
  a bogus ERESOLVE (it did for `@hookform/resolvers` against zod 4, whose peer range was fine). Install with
  `npx npm@12 install --save-exact ...`; versions in `package.json` are pinned exactly, and the lockfile stays
  compatible with npm 11's `npm ci`.
- **Session** (`src/lib/session/`): the gateway JWT is in `sessionStorage` (`session_jwt`) and the in-memory store
  only. Never copy it into React state, props, URLs or logs; `Session` deliberately has no token field, and only the
  API layer reads it via `sessionToken()`. Feature requests go through the `api` client, whose middleware adds
  `X-Jwt-Token` and ends the session on a 401. When the gateway's OpenAPI doesn't describe a route's request body
  (it describes none today, e.g. `POST /auth/api/invitations`), use `requestWithSession` in `src/lib/api/client.ts`
  instead of casting: same two session rules, plus a timeout and `ApiError`/`NO_RESPONSE` failures. Calls made before there is a session (login, signup, invitation
  lookup and accept) go through `requestWithoutSession` in `src/features/auth/api.ts` with `fetch` + `buildUrl`:
  the gateway's OpenAPI doesn't describe their bodies or `?jwt=true`/`?token=`, and they must not end a session on
  401. Logout is the deliberate exception: `requestSignOut` runs after `endSession` has already cleared the local
  session, so it does its own `fetch` to send the old JWT, uses `keepalive` so the request survives a reload, and
  never rejects. Don't route it through a helper that throws.
- **Only login returns a gateway JWT** (`?jwt=true`). The gateway's signup and invitation-accept routes answer 201
  with auth's raw token digest in `data.token`, which the panel can't turn into a session. `signUp` and
  `acceptInvitation` (`src/features/auth/`) ignore that digest and sign in with the same email and password right
  after; if that sign-in fails the page says the account exists (`SignedUpNotSignedInError`). Never store or
  forward the digest. The clean fix is `?jwt=true` on those gateway routes; until then this is deliberate.
- **Forms:** react-hook-form + zod. Shared rules live in `src/features/auth/form-rules.ts` (`required`,
  `passwordField`, `passwordsMatch`; the 8-character minimum mirrors auth's `User` validation). Wrap each control in
  `Field` (`src/components/ui/field.tsx`), which puts `id`, `aria-invalid` and `aria-describedby` on its single
  child. Browser checks show next to their field; server validation errors arrive as one joined message
  (presentable) and show at form level. Two server errors that share a status (both signup 409s) are told apart by
  the server's fixed message, the same way auth's controller branches.
- **One-shot tokens:** data looked up by a single-use token (an invitation) is cached for the visit
  (`staleTime: Infinity`, `retry: false`) and must be invalidated the moment the token is consumed, without
  refetching the page that is showing the outcome (`useAcceptInvitation` uses `refetchType: 'none'`). Otherwise
  Back shows a usable form for a dead link.
- **Routes:** signed-in pages live under `src/routes/_authenticated/` (guard + session watcher); `/t` is tenant
  admins only, `/admin` super admins only. `/login`, `/signup`, `/invitations/accept`, `/health` and `/style-guide`
  are public. `/login` and `/signup` send a signed-in user to their area; `/invitations/accept` does not (the page
  asks them to sign out first, so the new account never mixes with the old session). `/invitations/accept?token=`
  and the planned `/password/reset?token=` are the paths auth's emails link to and must not change. Never link to
  a path that isn't in `src/routeTree.gen.ts`; the login page's `/forgot-password` is the one known dead link,
  which OW-6 repoints to `/password/forgot`.
- **Internal pages** (`/style-guide`, `/health`) and their links (sidebar "Internal", login footer) exist only when
  `config.showInternalPages` is on: `npm run dev` and builds with `VITE_APP_ENV=staging` (the staging compose file
  passes it as a build arg). Any other build is production and serves them as not found.
- **Gateway responses** use the presentable envelope (`{ data, success, ... }` / `{ error: { message, status } }`);
  `toApiError` turns failures into `ApiError`. `/health` is the exception (its own `{ service, status }` shape).
  Statuses the auth pages branch on: 401 wrong credentials, 403 suspended organisation, 404 for an invitation that
  is unknown, used, revoked, expired or in a suspended tenant (one message for all of them), 409 for a taken email
  or a clashing organisation name (fixed messages), 422 joined validation message.
- **Real test data locally:** the auth service's dev database is the source. An invitation's raw token exists only
  in the email, so mint one with `direnv exec . bin/rails runner` in `../thirtyplus_auth_service`
  (`Invitation.issue!(tenant:, invited_by:, email:, role:).raw_token`). The "Signup Check Org" tenant was created
  by OW-4's browser check and can be reused.
- **21st.dev components:** install via the shadcn CLI, then replace `next/link`/`next/image`, move Tailwind 3 config
  into `@theme`, restyle to tokens, check keyboard access, and note the licence at the top of the file.
