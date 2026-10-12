import { expect, type Page, test } from '@playwright/test'

import { jwt } from './support/jwt'

// The gateway is mocked with page.route: these tests need no backend.

async function mockLogin(page: Page, token: string) {
  const requests: { headers: Record<string, string>; body: unknown }[] = []
  await page.route('**/auth/api/login?jwt=true', async (route) => {
    requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() })
    await route.fulfill({ json: { jwt: token, success: true } })
  })
  return requests
}

async function mockLogout(page: Page, status = 200) {
  const tokens: (string | undefined)[] = []
  await page.route('**/auth/api/logout', async (route) => {
    tokens.push(route.request().headers()['x-jwt-token'])
    await route.fulfill({ status, json: { data: { message: 'Logged out successfully' }, success: true } })
  })
  return tokens
}

async function signIn(page: Page) {
  await page.getByLabel('Email').fill('asha@example.com')
  await page.getByLabel('Password').fill('correct horse')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

const storedToken = (page: Page) => page.evaluate(() => sessionStorage.getItem('session_jwt'))

test('an admin signs in, stays signed in across a reload, and signs out', async ({ page }) => {
  const token = jwt()
  const logins = await mockLogin(page, token)
  const logouts = await mockLogout(page)

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page).toHaveTitle('RWLabs Operator')
  await signIn(page)

  await expect(page).toHaveURL(/\/t$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Asha' })).toBeVisible()
  expect(logins[0].body).toEqual({ email: 'asha@example.com', password: 'correct horse' })
  expect(logins[0].headers).toMatchObject({ 'x-platform': 'web', 'x-api-version': 'application/api.thirtyplus.v1' })
  for (const header of ['x-device-identifier', 'x-app-version', 'x-os-version']) expect(logins[0].headers[header]).toBeTruthy()
  // The JWT is kept for the tab only: sessionStorage, never localStorage or the URL.
  expect(await storedToken(page)).toBe(token)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(token)
  expect(page.url()).not.toContain(token)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Welcome, Asha' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  expect(logouts).toEqual([token])
  expect(await storedToken(page)).toBeNull()

  // Signed out means signed out: the tenant area sends you back to the login page.
  await page.goto('/t')
  await expect(page).toHaveURL(/\/login\?redirect=%2Ft$/)
})

test('signing out still clears the session when the server call fails', async ({ page }) => {
  await mockLogin(page, jwt())
  await mockLogout(page, 500)
  await page.goto('/login')
  await signIn(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect(await storedToken(page)).toBeNull()
})

test('a super admin lands in the super-admin area', async ({ page }) => {
  await mockLogin(page, jwt({ role_name: 'super_admin', role_display_name: 'Super Admin', tenant_id: null }))
  await page.goto('/login')
  await signIn(page)
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByText('Super Admin', { exact: true })).toBeVisible()
})

test('a role that cannot use the panel is turned away and signed out', async ({ page }) => {
  const consumer = jwt({ role_name: 'user' })
  await mockLogin(page, consumer)
  const logouts = await mockLogout(page)
  await page.goto('/login')
  await signIn(page)

  await expect(page.getByRole('alert')).toHaveText("This account can't use the operator panel yet.")
  await expect(page).toHaveURL(/\/login$/)
  expect(logouts).toEqual([consumer])
  expect(await storedToken(page)).toBeNull()
})

test('wrong credentials are explained', async ({ page }) => {
  await page.route('**/auth/api/login?jwt=true', (route) =>
    route.fulfill({ status: 401, json: { error: { message: 'Invalid Email or Password', status: 401 }, success: false } }),
  )
  await page.goto('/login')
  await signIn(page)
  await expect(page.getByRole('alert')).toHaveText("That email and password don't match an account.")
  await expect(page.getByLabel('Password')).toHaveValue('')
})

test('an expired session sends you to sign in, then back to the page you were on', async ({ page }) => {
  await page.addInitScript((expired) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('session_jwt', expired)
      sessionStorage.setItem('seeded', '1')
    }
  }, jwt({ expires_at: Math.floor(Date.now() / 1000) - 60 }))
  await mockLogin(page, jwt())

  await page.goto('/t')
  await expect(page).toHaveURL(/\/login\?redirect=%2Ft&reason=expired$/)
  await expect(page.getByText('Your session has expired. Sign in again to continue.')).toBeVisible()
  expect(await storedToken(page)).toBeNull()

  await signIn(page)
  await expect(page).toHaveURL(/\/t$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Asha' })).toBeVisible()
})
