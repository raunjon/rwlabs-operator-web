# RWLabs Operator Web — v1 Design

**Date:** 2026-10-12
**Status:** Draft for review
**Repo:** `rwlabs_operator_web/` (GitHub `raunjon/rwlabs-operator-web`)
**Talks to:** `thirtyplus_gateway` only (never directly to auth, operator or meta)

## 1. Purpose

A browser UI for the multi-tenant operator platform. Event organisers (tenants) use it to run events, venues and
leads. The platform owner uses it to manage tenants.

- **Launch users:** the ThirtyPlus internal team (ThirtyPlus is a normal tenant) and Raunak as `super_admin`.
- **Soon after:** external organisers. The design must not assume a single tenant anywhere.
- **Branding:** one product, one domain, currently "RWLabs". The name will change, so it lives in one config value.
  No per-tenant white-labelling (logos, colours, domains) in v1.
- **Visual direction:** not decided yet. Raunak will provide the palette and visual guidelines after the scaffold
  exists. Until then the app uses shadcn/ui's neutral defaults, with every colour coming from tokens (§6), so the
  palette arrives as a token change.

## 2. Scope

### In v1

**Tenant shell (role `admin`):**
- Events: list, upcoming, create, edit, delete.
- Venues: list, create, edit, delete.
- Leads: list with filters and pagination, view, create, edit, delete; CSV import, CSV export, import template
  download.
- Settings: custom field definitions (CRUD), tenant action configs (list, edit), webhook endpoints (create, view,
  edit), tenant credentials (CRUD; secret values are write-only in the UI).
- Meta lead forms: list, link an available form to an event, edit, delete, trigger a sync.
- Ads: read-only view of campaigns → ad sets → ads, with 30-day insights. No start/stop.

**Super-admin shell (role `super_admin`):**
- Tenant list.
- Create a tenant and invite its first admin.
- Suspend and reactivate a tenant.

### Not in v1

- Dashboards and analytics.
- WhatsApp anything (platform phase 2).
- Roles other than `admin` and `super_admin` in the UI.
- "Act as tenant" (impersonation) for super-admin. Planned as the next phase; v1 leaves room for it (§5.3).
- httpOnly cookie sessions. Follow-up before the first external tenant (§5.2).
- White-labelling.

## 3. Backend dependencies (separate tickets, separate repos)

The frontend v1 cannot finish without these. Each is its own ticket in its own repo and is out of scope for this
repo's plans.

| Repo | Jira | Change |
|---|---|---|
| `thirtyplus_auth_service` | AUTH | Super-admin endpoints: list tenants, create tenant + first-admin invitation, suspend, reactivate |
| `thirtyplus_gateway` | GAT | Routes for the new auth super-admin endpoints and for the new operator ads endpoints |
| `rwlabs_operator_service` | OS | Read-only GET endpoints for campaigns, ad sets, ads and their insights, wrapping the existing `MetaApiService` (tenant → `TenantCredential(provider: "meta")`) |

Everything else in §2 already exists behind the gateway's `/auth/api/*` and `/operator/api/*` scopes.

## 4. Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| Build / dev server | Vite |
| UI | React 19 |
| Routing | TanStack Router (file-based, typed search params) |
| Server state | TanStack Query |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui as the base; 21st.dev components where clearly better (§6) |
| Forms | react-hook-form + zod |
| API types | `openapi-typescript` + `openapi-fetch`, generated from the gateway's OpenAPI file |
| Unit / component tests | Vitest + Testing Library + MSW |
| End-to-end tests | Playwright |
| Node | Current LTS, pinned in `.node-version` |

Exact library versions are whatever is current and stable on scaffold day, pinned by the lockfile.

**Why a Vite SPA, not Next.js:** every screen is behind login (no SEO or public pages), the gateway is already the
backend-for-frontend, and the work is CRUD-heavy, which fits client-side caching. A static build is also simpler
to deploy and roll back than a Node server.

## 5. Architecture

### 5.1 Request path

```
local:    browser → localhost:3020 (Vite dev server)
                     ├─ /                        → app
                     ├─ /auth/api/*, /operator/api/*, /health  ─proxy→ VITE_GATEWAY_URL (default http://localhost:3000)

staging:  browser → Cloudflare tunnel → panel (nginx :80)
                     ├─ /                        → static app (index.html fallback)
                     ├─ /auth/api/*, /operator/api/*, /health  ─proxy→ GATEWAY_UPSTREAM (http://gateway:3000)
```

The browser only ever talks to the panel's origin, so no CORS is involved in either environment.

**Portability constraints** (so the panel can later move to its own server or a static host as a config change,
not a code change):
1. Every API call goes through one client module (`src/lib/api/`), which prefixes `VITE_API_BASE_URL`. It defaults
   to empty (same origin). Setting it to the gateway's URL turns the app into a cross-origin client.
2. nginx reads its upstream from the `GATEWAY_UPSTREAM` env var (nginx's built-in env templating), never a hardcoded
   host.
3. File downloads (CSV export, import template) go through the API client (fetch → blob → save), never plain
   `<a href>` links, because links can't carry the auth header.
4. If the panel ever moves to its own host, keep it and the API under one parent domain so a future session cookie
   still works.

### 5.2 Authentication

Contract with the gateway (as implemented today):

1. `POST /auth/api/login?jwt=true` with email and password, plus device headers. The response body holds the
   gateway JWT.
2. Every later request sends `X-Jwt-Token: <jwt>`. The gateway extracts the auth token and the device headers from
   it and re-verifies with auth on each request.
3. Device headers on login: `X-Platform: web`, `X-Device-Identifier` (a random id generated once per browser and
   kept in `localStorage`), `X-App-Version` (the build's version), `X-OS-Version` (the OS family; auth rejects a
   login without it), `X-Api-Version`.
4. With `?jwt=true` the response is `{ jwt, success }` at the top level (not the usual `data` envelope). Errors use
   the normal envelope: wrong credentials 401, a suspended organisation 403.

The app decodes the JWT payload (no signature check; that is the server's job) to read `role_name`, `tenant_id`,
`expires_at`, `first_name`, `last_name` and `email`.

- **Storage (v1):** the JWT is kept in `sessionStorage`. It survives a reload and is gone when the tab closes.
  It is never written anywhere else. Follow-up before the first external tenant: the gateway sets an httpOnly cookie
  and the app stops handling the token.
- **Role gate:** after login, only `admin` and `super_admin` get in. Any other role sees "This account can't use the
  operator panel yet" and the token is discarded immediately. This is a UI rule; operator still enforces permissions
  on every request.
- **Expiry:** a 401 from any call clears the session and returns to the login page with the attempted URL kept, so
  the user lands back where they were after logging in again. The app also checks `expires_at` on start.
- **Logout:** calls `POST /auth/api/logout`, then clears the session regardless of the result.

### 5.3 Two shells, chosen by role

```
/login                         public
/                              redirect by role
/t/...                         tenant shell (admin)
    /t/events, /t/events/:id
    /t/venues
    /t/leads, /t/leads/:id
    /t/meta-lead-forms
    /t/ads
    /t/settings/{custom-fields, actions, webhooks, credentials}
/admin/...                     super-admin shell (super_admin)
    /admin/tenants, /admin/tenants/new, /admin/tenants/:id
```

Route guards check the role from the session. Each shell has its own sidebar.

**Room for "act as tenant" (not built in v1):**
- The tenant shell gets its tenant from a session-level `tenantContext`, not straight from the JWT claim. In v1 it
  always equals the JWT's `tenant_id`.
- The API client has one hook where tenant context is attached to outgoing requests. In v1 it adds nothing; with
  impersonation it would add the acting-tenant header.
- The shell layout has a slot above the main content for an "Acting as …" banner. Empty in v1.

### 5.4 Data layer

- **Response envelopes** come from the `presentable` gem:
  - Success: `{ data, success: true, current_page, total_pages, total_count }`. `page=0` returns everything.
  - Error: `{ error: { message, status }, success: false }`.
- The API client unwraps `data` and turns error envelopes into a typed `ApiError { status, message }`.
- **Each feature owns its queries** (`src/features/<feature>/api.ts`): query key factories, `queryOptions`,
  mutations. Mutations invalidate the feature's keys (e.g. a CSV import invalidates all lead lists).
- **Filters and pagination live in the URL** as typed search params, so links are shareable and back/forward works.
- **Validation errors are a single joined message** (`errors.full_messages.join(', ')`), not per field. Forms show
  it as a form-level error. Field-level mapping would need a backend change and is not in v1.
- **Generated types:** an `npm run api:types` script generates `src/lib/api/schema.d.ts` from
  `../thirtyplus_gateway/docs/openapi/generated/openapi.yaml`. The generated file is committed, because the Docker
  build cannot see sibling repos.

### 5.5 Source layout

```
src/
  main.tsx, router.tsx           entry, router + QueryClient providers
  config.ts                      product name, env reads (single place)
  routes/                        TanStack Router file routes (thin: guards, loaders, page composition)
  features/<feature>/            api.ts (queries/mutations), components/, schemas.ts (zod)
  lib/api/                       client, ApiError, schema.d.ts (generated), download helper
  lib/session/                   token storage, JWT decode, role gate, tenantContext
  components/ui/                 shadcn + adopted 21st.dev components
  components/                    shared app components (layout, empty/error states, data table)
  styles/tokens.css              all design tokens
```

State rules: server data in TanStack Query; filters and pagination in the URL; the session in one small context;
form drafts in react-hook-form. No global store.

## 6. Visual system (placeholder until guidelines arrive)

- All colours, radii and font families are CSS variables in `src/styles/tokens.css`, mapped into Tailwind 4's
  `@theme`. Components use only semantic tokens (`bg-surface`, `text-muted`, …), never raw hex values.
- Until Raunak's palette arrives, the tokens hold shadcn/ui's neutral defaults. No visual design work happens before
  then.
- **21st.dev rule:** adopt a component only when it is clearly better than the shadcn equivalent (likely candidates:
  sidebar, command palette, upload dropzone, empty states). On adoption: replace Next-specific imports
  (`next/link`, `next/image`), move any Tailwind 3 config into `@theme`, restyle it to our tokens, check keyboard
  access, and record its licence in a comment at the top of the file.

## 7. Error, empty and loading states

Every data view handles four states: loading (skeleton), empty (says what to do next, with the primary action),
error (the server's message plus a retry), and success. 401 is global (§5.2). 403 shows "You don't have access to
this" in place of the view. Network failures show a retry, not a blank page.

## 8. Deployment

### In this repo
- **`Dockerfile`**, two stages: Node builds `dist/`; `nginx:alpine` serves it. No Node at runtime.
- **`nginx/default.conf.template`:**
  - `/` serves `dist/` with an `index.html` fallback for client-side routes.
  - Hashed assets get long-lived cache headers; `index.html` gets `no-cache`.
  - `/auth/api/`, `/operator/api/` and `/health` are proxied to `${GATEWAY_UPSTREAM}`, with `Host` set to
    `${GATEWAY_HOST_HEADER}` (staging: `localhost:3000`, because staging's gateway rejects unknown hostnames, OS-29).

### In `refactor/` (the staging workspace)
- `docker-compose.yml`: new `panel` service built from `./rwlabs_operator_web`, `depends_on: gateway`, env
  `GATEWAY_UPSTREAM=http://gateway:3000` and `GATEWAY_HOST_HEADER=localhost:3000`, port `3020:80` published so the
  host can check it.
- `deploy.sh`: add `panel` (repo `rwlabs_operator_web`). After a rebuild it checks `http://localhost:3020/health`,
  which proves nginx is up, the proxy works, and the gateway and its services are healthy, all in one request.
- `scripts/start-all-services.sh` / `close-all-services.sh`: add the Vite dev server on port 3020.
- The Cloudflare tunnel's public hostname points at `http://panel:80` instead of the gateway. This is a dashboard
  change Raunak makes by hand.

## 9. Testing

- **Unit / component (Vitest + Testing Library + MSW):** the session module (decode, expiry, role gate), the API
  client (envelope unwrap, `ApiError`, 401 handling, download helper), and each feature's forms and tables against
  MSW-mocked gateway responses.
- **End-to-end (Playwright),** against a locally running stack with seeded data: login as admin, login rejected for a
  non-admin role, leads list → CSV import → the new lead appears, logout.
- `npm run typecheck`, `npm run lint` and `npm test` must pass before merge.

## 10. Delivery order

Each step is its own implementation plan.

1. **Scaffold (the next plan):** Vite + React + TS project, Tailwind 4, shadcn/ui init, TanStack Router + Query
   wiring, `config.ts` with the product name, `tokens.css` with neutral defaults, the API client skeleton, Vitest and
   Playwright set up, lint and typecheck, Dockerfile + nginx template, and the compose / `deploy.sh` /
   start-script changes. The only page is a "Hello world" page showing the product name and the result of
   `GET /health` through the proxy, so one screen proves the dev proxy (locally) or nginx (in staging) reaches the
   gateway.
2. Session and login: login page, role gate, guards, both empty shells with sidebars, logout.
3. Tenant features: events and venues, then leads (with CSV), then settings, then Meta lead forms.
4. Ads view (after the OS and GAT ads tickets land).
5. Super-admin tenants (after the AUTH and GAT tickets land).

Visual guidelines can land at any point after step 1, as a token change plus any component restyling.
