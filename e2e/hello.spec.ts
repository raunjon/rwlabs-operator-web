import { expect, test } from '@playwright/test'

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
