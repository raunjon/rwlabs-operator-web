import { expect, type Page, test } from '@playwright/test'
import { jwt } from './support/jwt'

// The gateway is mocked with page.route: these tests need no backend.

const SESSION_KEY = 'session_jwt'

async function signInAsAdmin(page: Page) {
  const token = jwt({ first_name: 'Ira', last_name: 'S', email: 'ira@example.com', tenant_id: 9, role_name: 'admin' })
  await page.goto('/health') // any route, just to establish the origin for sessionStorage
  await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [SESSION_KEY, token] as const)
}

type ConnectionState = { connected: boolean; connected_at?: string }

async function mockConnection(page: Page, initial: ConnectionState) {
  const state = { ...initial }
  await page.route('**/operator/api/meta_connection', async (route) => {
    if (route.request().method() === 'POST') {
      state.connected = true
      state.connected_at = '2026-05-01T10:00:00.000Z'
      await route.fulfill({ json: { data: { connected: true, connected_at: state.connected_at }, success: true } })
      return
    }
    await route.fulfill({ json: { data: state, success: true } })
  })
  return state
}

type MetaPage = { id: number; label: string; page_id: string; ad_account_id: string | null }

async function mockPages(page: Page, initial: MetaPage[]) {
  const pages = [...initial]
  const requests: { method: string; body: unknown }[] = []
  await page.route('**/operator/api/meta_credentials', async (route) => {
    const req = route.request()
    requests.push({ method: req.method(), body: req.postDataJSON() })
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      const created: MetaPage = {
        id: pages.length + 1,
        label: String(body.label ?? ''),
        page_id: String(body.page_id ?? ''),
        ad_account_id: body.ad_account_id ? String(body.ad_account_id) : null,
      }
      pages.push(created)
      await route.fulfill({ json: { data: created, success: true } })
      return
    }
    await route.fulfill({ json: { data: pages, success: true } })
  })
  return { pages, requests }
}

test('an admin connects to Meta, adds a page and sees it in the list', async ({ page }) => {
  await mockConnection(page, { connected: false })
  const { requests } = await mockPages(page, [])
  await signInAsAdmin(page)

  await page.goto('/t/settings/meta')
  await expect(page.getByRole('heading', { level: 1, name: 'Meta' })).toBeVisible()

  // Connect first.
  await page.getByRole('button', { name: 'Connect to Meta' }).click()
  await expect(page.getByRole('status', { name: 'Connected to Meta' })).toBeVisible()

  // Then add a Facebook page.
  await page.locator('#meta-add-label').fill('Main page')
  await page.locator('#meta-add-page-id').fill('12345')
  await page.locator('#meta-add-token').fill('tok_secret')
  await page.locator('#meta-add-ad-account').fill('act_42')
  await page.getByRole('button', { name: 'Add page' }).click()

  await expect(page.getByText('Main page', { exact: true })).toBeVisible()
  await expect(page.getByText('Facebook page 12345')).toBeVisible()
  await expect(page.getByText('Ad account act_42')).toBeVisible()
  // The token field is cleared after a successful add.
  await expect(page.locator('#meta-add-token')).toHaveValue('')
  // The create POST was sent with the token.
  const create = requests.find((r) => r.method === 'POST')
  expect(create?.body).toMatchObject({ label: 'Main page', page_id: '12345', page_access_token: 'tok_secret', ad_account_id: 'act_42' })
})

test("Meta's token rejection is shown as the server's message, keeping the form open", async ({ page }) => {
  await mockConnection(page, { connected: true, connected_at: '2026-05-01T10:00:00.000Z' })
  await page.route('**/operator/api/meta_credentials', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      await route.fulfill({
        status: 422,
        json: { error: { message: 'Meta rejected this access token as invalid or expired', status: 422 }, success: false },
      })
      return
    }
    await route.fulfill({ json: { data: [], success: true } })
  })
  await signInAsAdmin(page)

  await page.goto('/t/settings/meta')
  await page.locator('#meta-add-label').fill('Main page')
  await page.locator('#meta-add-page-id').fill('12345')
  await page.locator('#meta-add-token').fill('tok_bad')
  await page.getByRole('button', { name: 'Add page' }).click()

  await expect(page.getByRole('alert')).toContainText('Meta rejected this access token as invalid or expired')
  // The form stays visible so the admin can paste a new token.
  await expect(page.locator('#meta-add-token')).toBeVisible()
})

test('non-admins can’t open the Meta settings page', async ({ page }) => {
  const token = jwt({ first_name: 'Ira', email: 'ira@example.com', tenant_id: 9, role_name: 'event_manager' })
  await page.goto('/health')
  await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [SESSION_KEY, token] as const)

  await page.goto('/t/settings/meta')
  // The tenant guard redirects away from /t for a non-admin.
  await expect(page).not.toHaveURL(/\/t\/settings\/meta$/)
})
