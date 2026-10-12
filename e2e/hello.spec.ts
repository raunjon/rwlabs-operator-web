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

test('the style guide passes every contrast check in light and dark', async ({ page }) => {
  await mockGatewayHealth(page)
  await page.goto('/style-guide')
  const contrast = page.getByRole('region', { name: 'Contrast' })
  await expect(contrast.getByText(/^Pass /).first()).toBeVisible()
  await expect(contrast.getByText(/^Fails /)).toHaveCount(0)
  // neutral-50 from each mode's palette.
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 248, 249)')

  await page.getByText('Dark', { exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page.getByText(/showing the dark theme/)).toBeVisible()
  await expect(contrast.getByText(/^Fails /)).toHaveCount(0)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 24, 32)')

  // The choice survives a reload.
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
})

test('the start page links to the style guide', async ({ page }) => {
  await mockGatewayHealth(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'Style guide' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Style guide' })).toBeVisible()
})

// Holds the app module back so the assertions run on the page as first painted, before main.tsx executes.
async function gotoWithAppHeld(page: Page, path: string) {
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  let intercepted = false
  // The dev server may add a cache-busting query (?t=...) after a file change.
  await page.route(/\/src\/main\.tsx(\?.*)?$/, async (route) => {
    intercepted = true
    await held
    await route.fallback()
  })
  await mockGatewayHealth(page)
  await page.goto(path, { waitUntil: 'commit' })
  await expect.poll(() => intercepted).toBe(true)
  await expect(page.locator('#root')).toBeEmpty()
  return release
}

test('a dark OS setting applies the dark tokens before the app module runs', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const release = await gotoWithAppHeld(page, '/style-guide')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  release()
  await expect(page.getByText(/showing the dark theme/)).toBeVisible()
})

test('a stored theme beats the OS setting before the app module runs', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  const releaseDark = await gotoWithAppHeld(page, '/style-guide')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  releaseDark()
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked()
})

test('a stored light theme stays light on a dark OS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(() => localStorage.setItem('theme', 'light'))
  const release = await gotoWithAppHeld(page, '/style-guide')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  release()
  await expect(page.getByText(/showing the light theme/)).toBeVisible()
})
