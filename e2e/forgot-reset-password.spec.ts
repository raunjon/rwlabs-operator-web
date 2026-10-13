import { expect, type Page, test } from '@playwright/test'

// The gateway is mocked with page.route: these tests need no backend.

type Seen = { headers: Record<string, string>; body: unknown }

async function mockForgot(page: Page, respond: { status: number; json: unknown }) {
  const requests: Seen[] = []
  await page.route('**/auth/api/password/forgot', async (route) => {
    requests.push({ headers: route.request().headers(), body: route.request().postDataJSON() })
    await route.fulfill(respond)
  })
  return requests
}

async function mockReset(page: Page, respond: { status: number; json: unknown }) {
  const bodies: unknown[] = []
  await page.route('**/auth/api/password/reset', async (route) => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill(respond)
  })
  return bodies
}

test('a forgot-password request shows the neutral confirmation', async ({ page }) => {
  const forgots = await mockForgot(page, { status: 200, json: { data: { message: 'ok' }, success: true } })

  await page.goto('/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page).toHaveURL(/\/password\/forgot$/)
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()

  await page.getByLabel('Email').fill('ira@example.com')
  await page.getByRole('button', { name: 'Send reset link' }).click()

  await expect(page.getByRole('status')).toContainText('If an account exists for this email')
  expect(forgots[0].body).toEqual({ email: 'ira@example.com' })
})

test('a valid reset token lets the user set a new password and sign in again', async ({ page }) => {
  const resets = await mockReset(page, { status: 200, json: { data: { message: 'Password updated' }, success: true } })

  await page.goto('/password/reset?token=abc123')
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()

  await page.getByLabel('New password', { exact: true }).fill('newpassword1')
  await page.getByLabel('Confirm new password').fill('newpassword1')
  await page.getByRole('button', { name: 'Update password' }).click()

  await expect(page).toHaveURL(/\/login\?reason=password-updated$/)
  await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible()
  expect(resets).toEqual([{ token: 'abc123', password: 'newpassword1' }])
})

test('an expired reset token shows the invalid state with a way to ask for a new link', async ({ page }) => {
  await mockReset(page, {
    status: 404,
    json: { error: { message: 'Reset link is invalid or has expired', status: 404 }, success: false },
  })

  await page.goto('/password/reset?token=stale')
  await page.getByLabel('New password', { exact: true }).fill('newpassword1')
  await page.getByLabel('Confirm new password').fill('newpassword1')
  await page.getByRole('button', { name: 'Update password' }).click()

  await expect(page.getByRole('heading', { name: 'This reset link can’t be used' })).toBeVisible()
  await page.getByRole('link', { name: 'Request a new link' }).click()
  await expect(page).toHaveURL(/\/password\/forgot$/)
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
})
