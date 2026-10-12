import { expect, type Page, test } from '@playwright/test'

test('the start page greets and shows a healthy gateway', async ({ page }) => {
  await page.route('**/health', (route) => route.fulfill({ json: { service: 'gateway', status: 'ok' } }))
  await page.goto('/')
  await expect(page).toHaveTitle('RWLabs Operator')
  await expect(page.getByRole('heading', { level: 1, name: 'RWLabs Operator' })).toBeVisible()
  await expect(page.getByText('Gateway reachable. All services are healthy.')).toBeVisible()
})

test('the start page explains an unreachable gateway', async ({ page }) => {
  await page.route('**/health', (route) =>
    route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>' }),
  )
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

const DEGRADED_REPORT = {
  service: 'gateway',
  status: 'degraded',
  checks: { secrets: { RAILS_JWT_SECRET: true }, jwt_signing_key_matches_env: true },
  jwt_secret_fingerprint: 'abc123',
  services: {
    auth: { reachable: true, http_status: 200, status: 'ok', checks: { database: true }, jwt_secret_matches_gateway: true },
    operator: { reachable: false, status: 'down' },
  },
}

// Mocks the gateway's JSON /health but lets the browser's page load of /health through to the dev server, which
// must serve the panel for it (vite.proxy.ts).
async function mockGatewayHealth(page: Page) {
  await page.route('**/health', (route) =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : route.fulfill({ status: 503, json: DEGRADED_REPORT }),
  )
}

test('opening /health shows the system health page with each service', async ({ page }) => {
  await mockGatewayHealth(page)
  await page.goto('/health')
  await expect(page.getByRole('heading', { level: 1, name: 'System health' })).toBeVisible()
  await expect(page.getByText('Degraded', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'operator' }).getByText('down', { exact: true })).toBeVisible()
  await expect(page.getByText(/^Last refreshed at /)).toBeVisible()
})

test('the start page links to the system health page', async ({ page }) => {
  await mockGatewayHealth(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'System health details' }).click()
  await expect(page).toHaveURL(/\/health$/)
  await expect(page.getByRole('heading', { level: 1, name: 'System health' })).toBeVisible()
})
