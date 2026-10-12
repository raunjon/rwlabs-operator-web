# AGENTS.md: code review guide

This file tells code-review agents what to look for in `rwlabs_operator_web`. Read `CLAUDE.md` first for the stack,
commands and the non-obvious rules, and the design spec (`docs/superpowers/specs/2026-10-12-operator-web-v1-design.md`)
for what the panel must do. The backend it talks to has its own guide: `../thirtyplus_gateway/AGENTS.md`.

The panel is a static SPA that talks only to the gateway. It holds no data of its own, but it holds the user's
session token, decides what an operator sees, and is the first thing organisers outside ThirtyPlus will use. A bug
here is usually a leaked token, a screen that breaks on a real gateway response, or a deploy that only works in one
environment, so focus on those, not style.

## Review priorities, most important first

### 1. The session token never leaks

- **The gateway JWT lives in `sessionStorage` only** (spec §5.2), and goes out only in the `X-Jwt-Token` header.
  Flag it in `localStorage`, cookies set by the app, URLs or query strings, `console.*`, error messages, analytics,
  or React state that gets serialized. It contains the raw auth token.
- **The role gate is a UI rule.** Only `admin` and `super_admin` get in; anyone else sees a message and the token is
  discarded immediately. Flag a change that keeps a rejected token, or that treats the JWT payload (decoded without
  a signature check) as proof of anything beyond what to show.
- **A 401 from any call ends the session** and returns to login with the attempted URL kept. Flag a call path that
  swallows a 401 or retries it.
- **Logout clears the session even if the logout request fails.**

### 2. Every API call goes through the API layer

- **URLs come from `buildUrl` or the `api` client** (`src/lib/api/`). Flag hand-built URLs, hardcoded hosts or
  `localhost:3000`, and `fetch('/...')` in features. These break when `VITE_API_BASE_URL` points at a cross-origin
  gateway.
- **Downloads (CSV export, import template) use fetch → blob → save**, never `<a href>` to an API path. A link
  can't carry the auth header.
- **Errors become `ApiError` via `toApiError`.** Flag code that reads `response.json().error.message` by hand, or
  shows raw HTML error bodies (nginx/Vite proxy pages) to users.
- **Validation errors are one joined message, not per field** (presentable gem). Flag code that pretends to map
  them onto individual fields.
- **Generated types match the gateway.** If the PR depends on a new or changed gateway endpoint,
  `src/lib/api/schema.d.ts` must be regenerated (`npm run api:types`) in the same PR, not hand-edited. Flag `as`
  casts or `any` that paper over a type the schema should provide.

### 3. Proxy and deploy config stay in sync

- **The proxied paths are listed twice**: `vite.proxy.ts` (dev) and `nginx/default.conf.template` (staging/prod).
  A PR that changes one without the other is a finding.
- **nginx:** the upstream comes from `GATEWAY_UPSTREAM` (scheme://host:port, no path or trailing slash) and is
  resolved per request (`resolver` + a variable in `proxy_pass`). Flag a hardcoded upstream or a literal
  `proxy_pass http://...`, which caches the gateway's IP until nginx restarts. `/assets/` must stay
  `try_files $uri =404`; falling back to `index.html` there breaks open tabs after a deploy. `index.html` must stay
  `no-cache`.
- **Dev server:** port 3020, `strictPort`, and the `predev` port check. Flag anything that lets it start on another
  port.
- **No local Docker assumptions.** Docker runs on staging and production only. Don't require it for dev or tests.

### 4. Every data view handles every state

Per spec §7: loading (skeleton), empty (says what to do next, with the primary action), error (the server's
message and a retry), success, plus 403 ("You don't have access to this") and the global 401. Flag:
- a query with no error branch, or one that can stay pending forever (no timeout on something that can hang);
- a blank screen or a spinner where the spec asks for an empty state or an error;
- filters or pagination kept in component state instead of the URL search params;
- mutations that don't invalidate the queries that show the changed data.

### 5. Multi-tenancy and the two shells

- **The tenant shell reads its tenant from `tenantContext`, not straight from the JWT claim** (spec §5.3). That is
  what lets "act as tenant" be added later without a rewrite. Flag new direct reads of `tenant_id` in features.
- **Tenant context is attached in the API client's one hook**, not per request in features.
- **Super-admin and tenant routes stay separate** (`/admin/*` vs `/t/*`), each behind its role guard. Flag a route
  without a guard.
- The UI must not assume a single tenant anywhere (no hardcoded tenant ids, names or "ThirtyPlus" copy).

### 6. Design system

- **Colours, radii and fonts only through tokens** in `src/styles/tokens.css`. Flag raw hex/rgb/oklch values or
  arbitrary Tailwind colour values (`bg-[#...]`) in components, components using `--palette-*` directly instead of a
  semantic token, and `dark:` variants (the tokens already switch per mode).
- **Contrast:** a component that puts a new pair of tokens together (text on a background, a control border) needs
  the pair in `src/styles/contrast-pairs.ts`, so `tokens.test.ts` checks it against WCAG AA in light and dark.
- **The product name only from `config.productName`.** Flag the literal "RWLabs" anywhere else in `src/`.
- **New UI components** come from shadcn (`npx shadcn@3.8.5 add`) or 21st.dev, adapted per `CLAUDE.md`
  (no `next/*` imports, tokens only, keyboard accessible, licence noted). Flag a copied component that skips this.
- **Accessibility:** interactive elements are real `<button>`/`<a>`, form inputs have labels, focus is visible,
  status changes use `role="status"`. Tests querying by role and name are the cheapest proof.

### 7. Tests

Every behaviour change needs a test that fails without it. Look for:
- **HTTP mocked with MSW at the network boundary** (`src/test/msw.ts`, `onUnhandledRequest: 'error'`), not by
  stubbing `fetch` or the API module. A test must never reach a real gateway; one is often running on :3000 locally.
- **Outcomes asserted through the UI** (`getByRole`, `findByText`), not component internals or hook calls.
- **The unhappy paths:** network error, gateway HTML error page, 401, 403, 422 with a message, empty list, and a
  response that never arrives. A feature tested only against a 200 is under-tested.
- **e2e (`e2e/`) stays backend-free:** mock with `page.route`. Add an e2e test for anything that crosses routes
  (login → redirect, deep links).
- **A clean run:** `npm test`, `npm run typecheck`, `npm run lint` (zero warnings) and `npm run build` all pass.

## What not to flag

- **Plain layouts.** The palette and components are in place, but there is no app shell or page design yet.
- **Features from later spec steps** (login, shells, leads, settings, ads, super-admin) missing on a PR that doesn't
  claim them.
- **TypeScript 5.9 instead of 6/7, and installs done with `npx npm@12`.** Both are deliberate (see `CLAUDE.md`).
- **Generated files** (`src/routeTree.gen.ts`, `src/lib/api/schema.d.ts`) — review the PR's reason for changing
  them, not their contents.
- **Lint and formatting** that ESLint already enforces.

## How to report

- **Order findings Critical, then Important, then Minor**, each with `file:line`, what is wrong, a concrete
  failure scenario (user action or server response → wrong outcome), and the fix.
  - Critical: a leaked or persisted token, a route reachable without its role guard, a screen that shows another
    tenant's data, a build or deploy that can't start.
  - Important: an unhandled response state, an API call outside the API layer, proxy config out of sync, a missing
    test for the change's main behaviour, a client-visible regression.
  - Minor: everything else.
- **Say how you verified it:** read the code, ran a test, ran the dev server against the local gateway, or
  reproduced it in the browser.
- **Separate implementation bugs from design questions** that need a human decision.
