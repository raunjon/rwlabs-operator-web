import { expect, type Page, test } from '@playwright/test'
import { jwt } from './support/jwt'

// The gateway is mocked with page.route: these tests need no backend.

type Seen = { headers: Record<string, string>; body: unknown }

async function mockSignup(page: Page, respond: { status: number; json: unknown }) {
  const requests: Seen[] = []
  await page.route('**/auth/api/operators/signup', async (route) => {
    requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() })
    await route.fulfill(respond)
  })
  return requests
}

async function mockLogin(page: Page, token: string) {
  const requests: Seen[] = []
  await page.route('**/auth/api/login?jwt=true', async (route) => {
    requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() })
    await route.fulfill({ json: { jwt: token, success: true } })
  })
  return requests
}

async function fillSignup(page: Page) {
  await page.getByLabel('Organisation name').fill('Acme Events')
  await page.getByLabel('First name').fill('Ira')
  await page.getByLabel('Last name').fill('S')
  await page.getByLabel('Email').fill('ira@example.com')
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByLabel('Confirm password').fill('password123')
}

const storedToken = (page: Page) => page.evaluate(() => sessionStorage.getItem('session_jwt'))

test('a new organiser creates their organisation and lands in the panel signed in', async ({ page }) => {
  const token = jwt({ first_name: 'Ira', last_name: 'S', email: 'ira@example.com', tenant_id: 9 })
  const signups = await mockSignup(page, { status: 201, json: { data: { token: 'raw-auth-token' }, success: true } })
  const logins = await mockLogin(page, token)

  await page.goto('/login')
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()

  await fillSignup(page)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/t$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Ira' })).toBeVisible()
  expect(signups[0].body).toEqual({
    tenant_name: 'Acme Events',
    first_name: 'Ira',
    last_name: 'S',
    email: 'ira@example.com',
    password: 'password123',
  })
  expect(signups[0].headers).toMatchObject({ 'x-platform': 'web', 'x-api-version': 'application/api.thirtyplus.v1' })
  for (const header of ['x-device-identifier', 'x-app-version', 'x-os-version']) expect(signups[0].headers[header]).toBeTruthy()
  // The sign-in that follows uses what was just typed, so there is no second step.
  expect(logins[0].body).toEqual({ email: 'ira@example.com', password: 'password123' })
  expect(await storedToken(page)).toBe(token)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(token)
  expect(page.url()).not.toContain(token)
})

test('a taken email is explained, with a way to sign in instead', async ({ page }) => {
  const message = 'An account with this email already exists'
  const signups = await mockSignup(page, { status: 409, json: { error: { message, status: 409 }, success: false } })

  await page.goto('/signup')
  await fillSignup(page)
  await page.getByRole('button', { name: 'Create account' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText(message)
  await expect(page).toHaveURL(/\/signup$/)
  expect(signups).toHaveLength(1)
  expect(await storedToken(page)).toBeNull()

  // The only way out offered is one that exists; following it must reach a real page.
  await expect(alert.getByRole('link')).toHaveText(['Sign in'])
  await alert.getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('the browser checks the fields before anything is sent', async ({ page }) => {
  const signups = await mockSignup(page, { status: 201, json: { data: { token: 'x' }, success: true } })
  await page.goto('/signup')
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByLabel('Confirm password').fill('different')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByText('Enter your organisation’s name')).toBeVisible()
  await expect(page.getByText('Use at least 8 characters')).toBeVisible()
  await expect(page.getByText('The passwords don’t match')).toBeVisible()
  expect(signups).toHaveLength(0)
})
