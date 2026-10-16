import { expect, type Page, test } from '@playwright/test'
import { jwt } from './support/jwt'

// OW-15: the venues directory. A tenant admin (/t/venues) can only read it; a super admin (/admin/venues) can also
// add and delete. The gateway is mocked with page.route and keeps its venues in memory, so a create shows up in the
// next list request.

const SESSION_KEY = 'session_jwt'
const HAS_EVENTS = 'Cannot delete record because dependent events exist'

async function signIn(page: Page, claims: Record<string, unknown>) {
  await page.goto('/health') // any route, just to establish the origin for sessionStorage
  await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [SESSION_KEY, jwt(claims)] as const)
}

type GatewayVenue = Record<string, unknown> & { id: number; name: string }

const baseVenue = (overrides: GatewayVenue): GatewayVenue => ({
  subtitle: null,
  description: null,
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  latitude: null,
  longitude: null,
  amenities: [],
  total_capacity: null,
  seating_capacity: null,
  poc_name: null,
  poc_mobile: null,
  poc_email: null,
  website: null,
  zomato_url: null,
  image_url: null,
  is_active: true,
  ...overrides,
})

// An in-memory operator: list, show, create and delete. Venues in `withEvents` refuse deletion the way the operator
// does (restrict_with_error).
async function mockGateway(page: Page, initial: GatewayVenue[], { withEvents = [] as number[] } = {}) {
  const venues = [...initial]
  const requests: { method: string; url: string; body: unknown }[] = []
  let nextId = 100

  await page.route('**/operator/api/venues**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const body = req.postDataJSON() as Record<string, unknown> | null
    requests.push({ method: req.method(), url: req.url(), body })
    const id = Number(url.pathname.split('/').pop())

    if (req.method() === 'GET' && Number.isNaN(id)) {
      await route.fulfill({
        json: { data: venues, success: true, current_page: 1, total_pages: venues.length ? 1 : 0, total_count: venues.length },
      })
      return
    }
    if (req.method() === 'POST') {
      const created = baseVenue({ ...(body as Partial<GatewayVenue>), id: nextId++, name: String(body?.name) })
      venues.push(created)
      await route.fulfill({ json: { data: created, success: true } })
      return
    }
    const index = venues.findIndex((v) => v.id === id)
    if (index === -1) {
      await route.fulfill({ status: 404, json: { error: { message: `Couldn't find Venue with 'id'=${id}`, status: 404 }, success: false } })
      return
    }
    if (req.method() === 'DELETE') {
      if (withEvents.includes(id)) {
        await route.fulfill({ status: 422, json: { error: { message: HAS_EVENTS, status: 422 }, success: false } })
        return
      }
      const [removed] = venues.splice(index, 1)
      await route.fulfill({ json: { data: removed, success: true } })
      return
    }
    await route.fulfill({ json: { data: venues[index], success: true } })
  })
  return requests
}

const skyline = baseVenue({
  id: 1,
  name: 'Skyline Rooftop',
  city: 'Mumbai',
  state: 'Maharashtra',
  seating_capacity: 80,
  total_capacity: 120,
  amenities: ['parking'],
})

test('a tenant admin can browse venues and open one, with nothing to change', async ({ page }) => {
  await mockGateway(page, [skyline])
  await signIn(page, { role_name: 'admin', tenant_id: 3 })
  await page.goto('/t')
  await page.getByRole('link', { name: 'Venues' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Venues' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Skyline Rooftop/ })).toContainText('80 seated · 120 total')
  await expect(page.getByRole('link', { name: 'New venue' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Skyline Rooftop' }).click()
  await expect(page).toHaveURL(/\/t\/venues\/1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Skyline Rooftop' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Amenities' })).toContainText('parking')
  await expect(page.getByRole('link', { name: 'Edit venue' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete venue' })).toHaveCount(0)
})

test('a super admin adds a venue and sees it in the list', async ({ page }) => {
  const requests = await mockGateway(page, [skyline])
  await signIn(page, { role_name: 'super_admin', tenant_id: null })
  await page.goto('/admin/venues')
  await page.getByRole('link', { name: 'New venue' }).click()

  await page.getByLabel('Name', { exact: true }).fill('Courtyard Cafe')
  await page.getByLabel('City (optional)', { exact: true }).fill('Pune')
  await page.getByLabel('Total capacity (optional)', { exact: true }).fill('60')
  await page.getByRole('button', { name: 'Create venue' }).click()

  await expect(page).toHaveURL(/\/admin\/venues$/)
  await expect(page.getByRole('row', { name: /Courtyard Cafe/ })).toContainText('Pune')
  const create = requests.find((r) => r.method === 'POST')
  expect(create?.body).toEqual({ name: 'Courtyard Cafe', city: 'Pune', total_capacity: 60, is_active: true })
})

test('deleting a venue that has events explains why it can’t go', async ({ page }) => {
  await mockGateway(page, [skyline], { withEvents: [1] })
  await signIn(page, { role_name: 'super_admin', tenant_id: null })
  await page.goto('/admin/venues/1')

  await page.getByRole('button', { name: 'Delete venue' }).click()
  await page.getByRole('button', { name: 'Yes, delete venue' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('This venue has events scheduled; delete those first.')
  await expect(alert).toContainText(`The server said: ${HAS_EVENTS}`)
  await expect(page).toHaveURL(/\/admin\/venues\/1$/)
})
