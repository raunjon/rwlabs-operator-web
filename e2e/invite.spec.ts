import { expect, type Page, test } from '@playwright/test'
import { jwt } from './support/jwt'

// The gateway is mocked with page.route: these tests need no backend.

async function signedInAsAdmin(page: Page) {
  await page.addInitScript((token) => {
    if (!sessionStorage.getItem('session_jwt')) sessionStorage.setItem('session_jwt', token)
  }, jwt())
}

async function mockCreate(page: Page, respond: (body: { email: string; role: string }) => { status: number; json: unknown }) {
  const bodies: unknown[] = []
  await page.route('**/auth/api/invitations', async (route) => {
    const body = route.request().postDataJSON() as { email: string; role: string }
    bodies.push(body)
    await route.fulfill(respond(body))
  })
  return bodies
}

test('an admin invites someone from the home page, sees the accept link and copies it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await signedInAsAdmin(page)
  const bodies = await mockCreate(page, ({ email, role }) => ({
    status: 200,
    json: {
      data: { id: 12, email, role, expires_at: 1_900_000_000, accept_token: 'raw-invite-token' },
      success: true,
    },
  }))

  await page.goto('/t')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Team' }).click()
  await expect(page).toHaveURL(/\/t\/team$/)
  const card = page.getByRole('region', { name: 'Invite a team member' })
  await card.getByLabel('Email').fill('new@example.com')
  await card.getByLabel('Role').selectOption({ label: 'Lead manager' })
  await card.getByRole('button', { name: 'Send invite' }).click()

  const link = 'http://localhost:3020/invitations/accept?token=raw-invite-token'
  const result = card.getByRole('status', { name: 'Invitation created' })
  await expect(result.getByRole('textbox', { name: 'Accept link' })).toHaveValue(link)
  await expect(result.getByText('Lead manager', { exact: true })).toBeVisible()
  expect(bodies).toEqual([{ email: 'new@example.com', role: 'lead_manager' }])
  await expect(card.getByLabel('Email')).toHaveValue('')

  await result.getByRole('button', { name: 'Copy link' }).click()
  await expect(result.getByText('Link copied')).toBeVisible()
  // A string: the e2e tsconfig has no DOM types.
  expect(await page.evaluate('navigator.clipboard.readText()')).toBe(link)
})

test('a duplicate email shows the server’s message', async ({ page }) => {
  await signedInAsAdmin(page)
  await mockCreate(page, () => ({
    status: 409,
    json: { error: { message: 'Email already has a pending invitation', status: 409 }, success: false },
  }))

  await page.goto('/t/team')
  const card = page.getByRole('region', { name: 'Invite a team member' })
  await card.getByLabel('Email').fill('taken@example.com')
  await card.getByRole('button', { name: 'Send invite' }).click()

  await expect(card.getByRole('alert')).toHaveText('Email already has a pending invitation')
  await expect(card.getByLabel('Email')).toHaveValue('taken@example.com')
  await expect(card.getByRole('textbox', { name: 'Accept link' })).toHaveCount(0)
})
