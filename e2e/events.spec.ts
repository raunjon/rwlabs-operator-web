import { expect, type Page, test } from '@playwright/test'
import { jwt } from './support/jwt'

// OW-14: event management for a tenant admin (/t/events) and a super admin (/admin/events). The gateway is mocked
// with page.route and keeps its events in memory, so a create shows up in the next list request.

const SESSION_KEY = 'session_jwt'

async function signIn(page: Page, claims: Record<string, unknown>) {
  await page.goto('/health') // any route, just to establish the origin for sessionStorage
  await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [SESSION_KEY, jwt(claims)] as const)
}

type GatewayEvent = Record<string, unknown> & { id: number; title: string; tenant_id: number }

const baseEvent = (overrides: Partial<GatewayEvent> & { id: number; title: string; tenant_id: number }): GatewayEvent => ({
  description: '',
  start_time: 1793300400,
  end_time: 1793314800,
  venue_id: 1,
  area: null,
  base_price: '1500.0',
  cover_price: '500.0',
  max_tickets: null,
  max_male_tickets: null,
  max_female_tickets: null,
  features: [],
  ...overrides,
})

// An in-memory operator: list (with tenant_id and search filters), show, create, update and delete.
async function mockGateway(page: Page, initial: GatewayEvent[], { callerTenant }: { callerTenant: number | null }) {
  const events = [...initial]
  const requests: { method: string; url: string; body: unknown }[] = []
  let nextId = 100

  await page.route('**/operator/api/venues**', (route) =>
    route.fulfill({ json: { data: [{ id: 1, name: 'Skyline Rooftop' }], success: true } }),
  )
  await page.route('**/operator/api/events**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const body = req.postDataJSON() as Record<string, unknown> | null
    requests.push({ method: req.method(), url: req.url(), body })
    const id = Number(url.pathname.split('/').pop())

    if (req.method() === 'GET' && Number.isNaN(id)) {
      const tenant = url.searchParams.get('tenant_id')
      const list = events.filter(
        (e) => (callerTenant === null || e.tenant_id === callerTenant) && (!tenant || e.tenant_id === Number(tenant)),
      )
      await route.fulfill({
        json: { data: list, success: true, current_page: 1, total_pages: list.length ? 1 : 0, total_count: list.length },
      })
      return
    }
    if (req.method() === 'POST') {
      const created = baseEvent({
        ...(body as Partial<GatewayEvent>),
        id: nextId++,
        title: String(body?.title),
        tenant_id: callerTenant ?? Number(body?.tenant_id),
        start_time: Date.parse(String(body?.start_time)) / 1000,
        end_time: Date.parse(String(body?.end_time)) / 1000,
      })
      events.unshift(created)
      await route.fulfill({ json: { data: created, success: true } })
      return
    }
    const index = events.findIndex((e) => e.id === id)
    if (index === -1) {
      await route.fulfill({ status: 404, json: { error: { message: `Couldn't find Event with 'id'=${id}`, status: 404 }, success: false } })
      return
    }
    if (req.method() === 'PATCH') {
      events[index] = {
        ...events[index],
        title: String(body?.title),
        start_time: Date.parse(String(body?.start_time)) / 1000,
        end_time: Date.parse(String(body?.end_time)) / 1000,
      }
    }
    const [event] = req.method() === 'DELETE' ? events.splice(index, 1) : [events[index]]
    await route.fulfill({ json: { data: event, success: true } })
  })
  return { events, requests }
}

async function fillEvent(page: Page, title: string) {
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Starts').fill('2026-11-06T19:00')
  await page.getByLabel('Ends').fill('2026-11-06T23:00')
  await page.getByLabel('Venue').selectOption({ label: 'Skyline Rooftop' })
}

test('a tenant admin creates, edits and deletes an event', async ({ page }) => {
  const { requests } = await mockGateway(page, [baseEvent({ id: 12, title: 'Friday Rooftop Mixer', tenant_id: 9 })], {
    callerTenant: 9,
  })
  await signIn(page, { tenant_id: 9, role_name: 'admin' })

  await page.goto('/t')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Events' }).click()
  await expect(page.getByRole('link', { name: 'Friday Rooftop Mixer' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Tenant' })).toHaveCount(0)

  // Create: back on the list, the new event is there; no tenant was sent.
  await page.getByRole('link', { name: 'New event' }).click()
  // The new-event route is code-split: wait for it, or the list's own Tenant id filter is still on screen.
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible()
  await expect(page.getByLabel('Tenant id')).toHaveCount(0)
  await fillEvent(page, 'Saturday Salsa Night')
  await page.getByRole('button', { name: 'Create event' }).click()
  await expect(page).toHaveURL(/\/t\/events$/)
  await expect(page.getByRole('link', { name: 'Saturday Salsa Night' })).toBeVisible()
  expect(requests.find((r) => r.method === 'POST')?.body).not.toHaveProperty('tenant_id')

  // Edit: saves in place.
  await page.getByRole('link', { name: 'Saturday Salsa Night' }).click()
  await page.getByLabel('Title').fill('Saturday Salsa Night (late)')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Event saved.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Saturday Salsa Night (late)' })).toBeVisible()

  // Delete: confirmed, then gone from the list.
  await page.getByRole('button', { name: 'Delete event' }).click()
  await page.getByRole('button', { name: 'Yes, delete event' }).click()
  await expect(page).toHaveURL(/\/t\/events$/)
  await expect(page.getByRole('link', { name: 'Friday Rooftop Mixer' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Saturday Salsa Night (late)' })).toHaveCount(0)
})

test('a super admin creates an event for a tenant and narrows the list to it', async ({ page }) => {
  const { requests } = await mockGateway(page, [baseEvent({ id: 12, title: 'Friday Rooftop Mixer', tenant_id: 3 })], {
    callerTenant: null,
  })
  await signIn(page, { tenant_id: null, role_name: 'super_admin', role_display_name: 'Super admin' })

  await page.goto('/admin/events')
  await page.getByRole('link', { name: 'New event' }).click()
  // The new-event route is code-split: wait for it, or the list's own Tenant id filter is still on screen.
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible()
  await page.getByLabel('Tenant id').fill('9')
  await fillEvent(page, 'Other org night')
  await page.getByRole('button', { name: 'Create event' }).click()
  await expect(page).toHaveURL(/\/admin\/events$/)
  expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({ tenant_id: 9 })

  // Cross-tenant by default, with a Tenant column.
  const created = page.getByRole('row').filter({ hasText: 'Other org night' })
  await expect(created.getByRole('cell', { name: '9', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Friday Rooftop Mixer' })).toBeVisible()

  // The tenant filter narrows the list, through the URL.
  const filters = page.getByRole('search', { name: 'Filter events' })
  await filters.getByLabel('Tenant id').fill('9')
  await filters.getByRole('button', { name: 'Apply filters' }).click()
  await expect(page).toHaveURL(/tenant_id=9/)
  await expect(page.getByRole('link', { name: 'Friday Rooftop Mixer' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Other org night' })).toBeVisible()
})
