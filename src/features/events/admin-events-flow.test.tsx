import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSession, startSession } from '@/lib/session/session'
import { gatewayEvent } from '@/test/events'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'

// OW-14, super admin: /admin/events. Same screens as the tenant area (events-flow.test.tsx), plus the tenant:
// a Tenant column and filter on the list, a required Tenant id on create, and a read-only tenant on edit.

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

function mockList(events: (url: URL) => unknown[]) {
  const urls: URL[] = []
  server.use(
    http.get('*/operator/api/events', ({ request }) => {
      const url = new URL(request.url)
      urls.push(url)
      const data = events(url)
      return HttpResponse.json({ data, success: true, current_page: 1, total_pages: 1, total_count: data.length })
    }),
  )
  return urls
}

function captureCreate(respond: (body: Record<string, unknown>) => Response) {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post('*/operator/api/events', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      bodies.push(body)
      return respond(body)
    }),
  )
  return bodies
}

const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname
const search = (router: ReturnType<typeof renderApp>) => router.state.location.search as Record<string, unknown>

beforeEach(() => {
  sessionStorage.clear()
  loadSession()
  startSession(makeJwt({ role_name: 'super_admin', tenant_id: null }))
  server.use(
    http.get('*/operator/api/venues', () =>
      HttpResponse.json({ data: [{ id: 1, name: 'Skyline Rooftop' }], success: true }),
    ),
  )
})

describe('the super admin’s events list', () => {
  it('is reached from the Super admin sidebar', async () => {
    mockList(() => [])
    const router = renderApp('/admin')
    await userEvent.click(
      within(await screen.findByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Events' }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument()
    expect(path(router)).toBe('/admin/events')
  })

  it('a tenant admin who opens it is sent to their own area', async () => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
    const router = renderApp('/admin/events')
    await waitFor(() => expect(path(router)).toBe('/t'))
  })

  it('lists every tenant’s events by default, with a Tenant column', async () => {
    const urls = mockList(() => [gatewayEvent({ tenant_id: 3 }), gatewayEvent({ id: 13, title: 'Other org night', tenant_id: 9 })])
    renderApp('/admin/events')
    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    expect(within(rows[0]).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Title',
      'Tenant',
      'Starts',
      'Venue',
      'Price',
    ])
    expect(within(rows[1]).getByRole('cell', { name: '3' })).toBeInTheDocument()
    expect(within(rows[2]).getByRole('cell', { name: '9' })).toBeInTheDocument()
    expect(urls[0].searchParams.has('tenant_id')).toBe(false)
  })

  it('the tenant filter narrows the list to one tenant, and clearing it goes back to all', async () => {
    const urls = mockList((url) =>
      url.searchParams.get('tenant_id') === '9'
        ? [gatewayEvent({ id: 13, title: 'Other org night', tenant_id: 9 })]
        : [gatewayEvent({ tenant_id: 3 }), gatewayEvent({ id: 13, title: 'Other org night', tenant_id: 9 })],
    )
    const router = renderApp('/admin/events')
    const filters = await screen.findByRole('search', { name: 'Filter events' })
    await userEvent.type(within(filters).getByLabelText('Tenant id'), '9')
    await userEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(search(router)).toEqual({ tenant_id: 9 }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Friday Rooftop Mixer' })).not.toBeInTheDocument())
    expect(urls.at(-1)!.searchParams.get('tenant_id')).toBe('9')

    await userEvent.clear(within(filters).getByLabelText('Tenant id'))
    await userEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(search(router)).toEqual({}))
    expect(await screen.findByRole('link', { name: 'Friday Rooftop Mixer' })).toBeInTheDocument()
    expect(urls.at(-1)!.searchParams.has('tenant_id')).toBe(false)
  })

  it('a tenant id that isn’t a whole number above 0 is refused in the browser', async () => {
    const urls = mockList(() => [])
    const router = renderApp('/admin/events')
    const filters = await screen.findByRole('search', { name: 'Filter events' })
    await userEvent.type(within(filters).getByLabelText('Tenant id'), '-4')
    await userEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }))
    expect(await screen.findByText('The tenant id is a whole number above 0')).toBeInTheDocument()
    expect(search(router)).toEqual({})
    expect(urls.every((url) => !url.searchParams.has('tenant_id'))).toBe(true)
  })
})

describe('the super admin creating an event', () => {
  async function fillValidForm() {
    await userEvent.type(await screen.findByLabelText('Title'), 'Other org night')
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-10-29T19:00' } })
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-10-29T23:00' } })
    // The venue options arrive with the venues query.
    await screen.findByRole('option', { name: 'Skyline Rooftop' })
    await userEvent.selectOptions(screen.getByLabelText('Venue'), 'Skyline Rooftop')
  }

  it('requires a Tenant id and sends it as tenant_id', async () => {
    mockList(() => [])
    const bodies = captureCreate(() => HttpResponse.json({ data: gatewayEvent({ id: 30, tenant_id: 9 }), success: true }))
    const router = renderApp('/admin/events/new')
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }))
    expect(await screen.findByText('Enter the tenant id')).toBeInTheDocument()
    expect(bodies).toHaveLength(0)

    await userEvent.type(screen.getByLabelText('Tenant id'), '9')
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }))
    await waitFor(() => expect(path(router)).toBe('/admin/events'))
    expect(bodies[0]).toMatchObject({ tenant_id: 9, title: 'Other org night' })
  })

  it('shows the server’s "Tenant required" at the Tenant id field', async () => {
    captureCreate(() => envelope(422, 'Tenant required'))
    renderApp('/admin/events/new')
    await fillValidForm()
    await userEvent.type(screen.getByLabelText('Tenant id'), '9')
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }))
    const tenant = screen.getByLabelText('Tenant id')
    await waitFor(() => expect(tenant).toHaveAttribute('aria-invalid', 'true'))
    expect(tenant).toHaveAccessibleDescription(/^Tenant required/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('the super admin editing an event', () => {
  it('shows the tenant read-only and never sends tenant_id', async () => {
    server.use(http.get('*/operator/api/events/12', () => HttpResponse.json({ data: gatewayEvent({ tenant_id: 9 }), success: true })))
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.patch('*/operator/api/events/12', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ data: gatewayEvent({ tenant_id: 9 }), success: true })
      }),
    )
    renderApp('/admin/events/12')
    expect(await screen.findByText('Tenant 9')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tenant id')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Event saved.')).toBeInTheDocument()
    expect(bodies[0]).not.toHaveProperty('tenant_id')
  })

  it('back links return to the super admin’s list', async () => {
    server.use(http.get('*/operator/api/events/12', () => HttpResponse.json({ data: gatewayEvent(), success: true })))
    mockList(() => [gatewayEvent()])
    const router = renderApp('/admin/events/12')
    // Wait for the loaded page: the loading state has its own copy of the link, which the loaded page replaces.
    await screen.findByLabelText('Title')
    await userEvent.click(screen.getByRole('link', { name: 'All events' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument()
    expect(path(router)).toBe('/admin/events')
  })
})
