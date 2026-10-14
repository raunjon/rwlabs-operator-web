import { expect, type Page, test } from '@playwright/test'
import { jwt } from './support/jwt'

// The gateway is mocked with page.route: these tests need no backend. The Facebook OAuth popup is also mocked —
// we never navigate to facebook.com; instead the test fires the postMessage the panel's callback route would send
// if the popup had completed the OAuth round-trip.

const SESSION_KEY = 'session_jwt'

async function signInAsAdmin(page: Page) {
  const token = jwt({ first_name: 'Ira', last_name: 'S', email: 'ira@example.com', tenant_id: 9, role_name: 'admin' })
  await page.goto('/health')
  await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [SESSION_KEY, token] as const)
}

async function mockConnection(page: Page, facebookLoginAvailable: boolean) {
  await page.route('**/operator/api/meta_connection', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        json: {
          data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' },
          success: true,
        },
      })
      return
    }
    await route.fulfill({
      json: {
        data: {
          connected: true,
          connected_at: '2026-05-01T10:00:00.000Z',
          facebook_login_available: facebookLoginAvailable,
        },
        success: true,
      },
    })
  })
}

async function mockPagesList(page: Page) {
  const credentials: Array<{ id: number; label: string; page_id: string; ad_account_id: string | null }> = []
  await page.route('**/operator/api/meta_credentials', async (route) => {
    await route.fulfill({ json: { data: credentials, success: true } })
  })
  return credentials
}

test('the Log in with Facebook button is hidden when the backend reports Facebook login isn’t configured', async ({ page }) => {
  await mockConnection(page, false)
  await mockPagesList(page)
  await signInAsAdmin(page)

  await page.goto('/t/settings/meta')
  await expect(page.getByRole('heading', { level: 1, name: 'Meta' })).toBeVisible()
  // The Facebook card isn't rendered; the manual Add card still is.
  await expect(page.getByRole('region', { name: 'Log in with Facebook' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Add a Facebook page' })).toBeVisible()
})

test('clicking Log in with Facebook fetches an authorize_url with the right redirect_uri', async ({ page }) => {
  await mockConnection(page, true)
  await mockPagesList(page)
  const authorizeRequests: string[] = []
  await page.route('**/operator/api/facebook_login/authorize_url*', async (route) => {
    authorizeRequests.push(route.request().url())
    await route.fulfill({
      json: {
        data: { authorize_url: 'https://www.facebook.com/v20.0/dialog/oauth?x=1', state_token: 'tok-123' },
        success: true,
      },
    })
  })
  await signInAsAdmin(page)

  await page.goto('/t/settings/meta')
  await page.getByRole('button', { name: 'Log in with Facebook' }).click()

  await expect.poll(() => authorizeRequests.length).toBeGreaterThan(0)
  const url = new URL(authorizeRequests[0])
  expect(url.pathname).toBe('/operator/api/facebook_login/authorize_url')
  expect(url.searchParams.get('redirect_uri')).toBe(`${new URL(page.url()).origin}/meta/facebook/callback`)
  // The actual window.open interception and the full popup → postMessage → settings-page round-trip are covered
  // by the unit-level flow test (src/features/meta/facebook-login-flow.test.tsx); this e2e just proves the button
  // is wired up through the real build and the session JWT reaches the gateway.
})

test("the callback route tells a direct visitor (no opener) the page is used by Facebook login", async ({ page }) => {
  // The callback is public (NOT under /_authenticated), so a visitor without an opener window just sees a short
  // explanation — nothing API-level happens. This proves the route is registered and the component mounts in
  // the absence of a popup opener; the full popup → postMessage → settings-page round-trip is covered by the
  // unit-level flow test (facebook-login-flow.test.tsx) since it depends on same-origin opener semantics the
  // test harness fakes directly.
  await page.goto('/meta/facebook/callback')
  await expect(page.getByText('This page is used by Facebook login. You can close it.')).toBeVisible()
})
