# RWLabs Operator Web

The operator panel for the RWLabs multi-tenant platform: a Vite + React + TypeScript SPA that talks only to the
gateway (`rwlabs_gateway`). Design: `docs/superpowers/specs/2026-10-12-operator-web-v1-design.md`.

## Run it

```bash
npm install
npm run dev          # http://localhost:3020, proxies /auth/api, /operator/api and /health to the gateway
```

Or start it with the Rails services from `refactor/`: `./scripts/start-all-services.sh` (stop with
`./scripts/close-all-services.sh`).

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

## Staging and production

Docker is used on staging and production only. The image (`Dockerfile`) is nginx serving `dist/` and proxying the
API paths to `GATEWAY_UPSTREAM` (with `GATEWAY_HOST_HEADER`), configured in `nginx/default.conf.template`. It runs as
the `console` service in `refactor/docker-compose.yml` (port 3020); deploy with `./deploy.sh console` from `refactor/`.
