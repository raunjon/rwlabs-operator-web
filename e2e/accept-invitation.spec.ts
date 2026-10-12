import { expect, type Page, test } from '@playwright/test'
import { jwt } from './support/jwt'

// The gateway is mocked with page.route: these tests need no backend.

const invite = { email: 'new@example.com', role: 'admin', tenant_name: 'Acme Events', expires_at: 1_900_000_000 }

async function mockLookup(page: Page, respond: { status: number; json: unknown }) {
  const tokens: (string | null)[] = []
  await page.route('**/auth/api/invitations/lookup**', async (route) => {
    tokens.push(new URL(route.request().url()).searchParams.get('token'))
    await route.fulfill(respond)
  })
  return tokens
}

async function mockAccept(page: Page, respond: { status: number; json: unknown }) {
  const bodies: unknown[] = []
  await page.route('**/auth/api/invitations/accept', async (route) => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill(respond)
  })
  return bodies
}

async function mockLogin(page: Page, token: string) {
  const bodies: unknown[] = []
  await page.route('**/auth/api/login?jwt=true', async (route) => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ json: { jwt: token, success: true } })
  })
  return bodies
}

const storedToken = (page: Page) => page.evaluate(() => sessionStorage.getItem('session_jwt'))

test('a valid invite shows who it is for, creates the account and signs the invitee in', async ({ page }) => {
  const token = jwt({ first_name: 'Ira', last_name: 'S', email: 'new@example.com', tenant_id: 9 })
  const lookups = await mockLookup(page, { status: 200, json: { data: invite, success: true } })
  const accepts = await mockAccept(page, { status: 201, json: { data: { token: 'raw-auth-token' }, success: true } })
  const logins = await mockLogin(page, token)

  await page.goto('/invitations/accept?token=abc123')
  await expect(page.getByRole('heading', { name: 'Join Acme Events' })).toBeVisible()
  await expect(page.getByText('new@example.com')).toBeVisible()
  await expect(page.getByText('Admin', { exact: true })).toBeVisible()
  expect(lookups).toEqual(['abc123'])

  await page.getByLabel('First name').fill('Ira')
  await page.getByLabel('Last name').fill('S')
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByLabel('Confirm password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/t$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Ira' })).toBeVisible()
  expect(accepts).toEqual([{ token: 'abc123', first_name: 'Ira', last_name: 'S', password: 'password123' }])
  expect(logins).toEqual([{ email: 'new@example.com', password: 'password123' }])
  expect(await storedToken(page)).toBe(token)
  expect(page.url()).not.toContain(token)
})

test('an expired or used invite is explained, with a way to sign in', async ({ page }) => {
  await mockLookup(page, {
    status: 404,
    json: { error: { message: 'Invitation not found or no longer valid', status: 404 }, success: false },
  })
  await page.goto('/invitations/accept?token=stale')
  await expect(page.getByRole('alert')).toHaveText('This invitation is no longer valid, ask your admin to resend it.')
  await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('a signed-in user is asked to sign out before accepting', async ({ page }) => {
  await page.addInitScript((existing) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('session_jwt', existing)
      sessionStorage.setItem('seeded', '1')
    }
  }, jwt({ email: 'asha@example.com' }))
  await mockLookup(page, { status: 200, json: { data: invite, success: true } })
  await page.route('**/auth/api/logout', (route) => route.fulfill({ json: { data: { message: 'ok' }, success: true } }))

  await page.goto('/invitations/accept?token=abc123')
  await expect(page.getByRole('status')).toContainText('asha@example.com')
  await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Sign out and continue' }).click()
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  expect(await storedToken(page)).toBeNull()
  await expect(page).toHaveURL(/\/invitations\/accept\?token=abc123$/)
})
