import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { gatewayVenue } from '@/test/venues'
import { VENUE_NOT_FOUND_MESSAGE } from './venues'

// OW-15, tenant admin: /t/venues. Read-only: venues are shared across tenants and only a super admin may change
// them. The super admin's screens are in admin-venues-flow.test.tsx.

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

function mockList(respond: (url: URL) => Record<string, unknown> | Response | Promise<Response>) {
  const urls: URL[] = []
  server.use(
    http.get('*/operator/api/venues', async ({ request }) => {
      const url = new URL(request.url)
      urls.push(url)
      const answer = await respond(url)
      return answer instanceof Response ? answer : HttpResponse.json(answer)
    }),
  )
  return urls
}

const onePage = (venues: unknown[]) => ({
  data: venues,
  success: true,
  current_page: 1,
  total_pages: venues.length ? 1 : 0,
  total_count: venues.length,
})

const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname
const search = (router: ReturnType<typeof renderApp>) => router.state.location.search as Record<string, unknown>

beforeEach(() => {
  sessionStorage.clear()
  loadSession()
  startSession(makeJwt())
})

describe('the venues list', () => {
  it('is reached from the sidebar’s Venues link', async () => {
    mockList(() => onePage([gatewayVenue()]))
    const router = renderApp('/t')
    await userEvent.click(await screen.findByRole('link', { name: 'Venues' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Venues' })).toBeInTheDocument()
    expect(path(router)).toBe('/t/venues')
  })

  it('shows a labelled skeleton while the list loads', async () => {
    mockList(async () => {
      await delay('infinite')
      return HttpResponse.json({})
    })
    renderApp('/t/venues')
    expect(await screen.findByRole('status', { name: 'Loading venues' })).toBeInTheDocument()
  })

  it('lists every venue, 25 a page, with name, place, capacity and whether it’s active; nothing to change', async () => {
    const urls = mockList(() =>
      onePage([
        gatewayVenue(),
        gatewayVenue({ id: 2, name: 'Courtyard Cafe', city: 'Pune', state: null, seating_capacity: null, total_capacity: 60, is_active: false }),
        gatewayVenue({ id: 3, name: 'Old Mill', city: null, state: null, seating_capacity: null, total_capacity: null }),
      ]),
    )
    renderApp('/t/venues')
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(within(rows[0]).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Name',
      'City / state',
      'Capacity',
      'Active',
    ])
    expect(within(rows[1]).getByRole('link', { name: 'Skyline Rooftop' })).toBeInTheDocument()
    expect(within(rows[1]).getByText('Mumbai, Maharashtra')).toBeInTheDocument()
    expect(within(rows[1]).getByText('80 seated · 120 total')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Yes')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Pune')).toBeInTheDocument()
    expect(within(rows[2]).getByText('60 total')).toBeInTheDocument()
    expect(within(rows[2]).getByText('No')).toBeInTheDocument()
    expect(within(rows[3]).getAllByText('—')).toHaveLength(2)
    expect(urls[0].searchParams.get('per_page')).toBe('25')
    expect(screen.queryByRole('link', { name: 'New venue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new venue/i })).not.toBeInTheDocument()
  })

  it('an empty list says so, without offering to add one', async () => {
    mockList(() => onePage([]))
    renderApp('/t/venues')
    expect(await screen.findByText('No venues yet.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add your first venue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'New venue' })).not.toBeInTheDocument()
  })

  it('a failed list shows the reason and recovers on Try again', async () => {
    let fail = true
    mockList(() => (fail ? new HttpResponse('<html>Bad gateway</html>', { status: 502 }) : onePage([gatewayVenue()])))
    renderApp('/t/venues')
    expect(await screen.findByText(UNREACHABLE_MESSAGE)).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Skyline Rooftop' })).toBeInTheDocument()
  })

  it('pages through the list with Next and Previous, keeping the page in the URL', async () => {
    const urls = mockList((url) => {
      const page = Number(url.searchParams.get('page'))
      return {
        data: [gatewayVenue({ id: page, name: `Venue on page ${page}` })],
        success: true,
        current_page: page,
        total_pages: 2,
        total_count: 26,
      }
    })
    const router = renderApp('/t/venues')
    expect(await screen.findByText('Page 1 of 2 · 26 venues')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Next page' }))
    expect(await screen.findByRole('link', { name: 'Venue on page 2' })).toBeInTheDocument()
    expect(search(router)).toEqual({ page: 2 })
    expect(urls.at(-1)!.searchParams.get('page')).toBe('2')
    await userEvent.click(screen.getByRole('link', { name: 'Previous page' }))
    expect(await screen.findByRole('link', { name: 'Venue on page 1' })).toBeInTheDocument()
    expect(search(router)).toEqual({})
  })

  it('a page past the end says so and links back to the first page', async () => {
    mockList((url) => (url.searchParams.get('page') === '9' ? { data: [], success: true } : onePage([gatewayVenue()])))
    const router = renderApp('/t/venues?page=9')
    await userEvent.click(await screen.findByRole('link', { name: 'Go to the first page' }))
    expect(await screen.findByRole('link', { name: 'Skyline Rooftop' })).toBeInTheDocument()
    expect(search(router)).toEqual({})
  })
})

describe('a venue', () => {
  it('a row’s name opens a read-only view of every field, amenities as chips', async () => {
    mockList(() => onePage([gatewayVenue()]))
    server.use(http.get('*/operator/api/venues/1', () => HttpResponse.json({ data: gatewayVenue(), success: true })))
    const router = renderApp('/t/venues')
    await userEvent.click(await screen.findByRole('link', { name: 'Skyline Rooftop' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Skyline Rooftop' })).toBeInTheDocument()
    expect(path(router)).toBe('/t/venues/1')
    const details = screen.getByRole('region', { name: 'Venue details' })
    const value = (label: string) => within(details).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
    expect(value('Subtitle')).toBe('Open-air bar')
    expect(value('Address')).toBe('14 Hill Road, Mumbai, Maharashtra 400050, India')
    expect(value('Coordinates')).toBe('19.059600, 72.829500')
    expect(value('Capacity')).toBe('80 seated · 120 total')
    expect(value('Contact')).toBe('Rohan Mehta · +91 98200 00000 · rohan@skyline.example')
    expect(value('Active')).toBe('Yes')
    expect(value('Zomato')).toBe('—')
    expect(within(details).getByRole('link', { name: 'https://skyline.example' })).toHaveAttribute(
      'href',
      'https://skyline.example',
    )
    const amenities = within(details).getByRole('list', { name: 'Amenities' })
    expect(within(amenities).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['parking', 'dance_floor'])

    expect(screen.queryByRole('link', { name: 'Edit venue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('a missing venue says so and links back to the list', async () => {
    server.use(http.get('*/operator/api/venues/99', () => envelope(404, "Couldn't find Venue with 'id'=99")))
    mockList(() => onePage([gatewayVenue()]))
    const router = renderApp('/t/venues/99')
    expect(await screen.findByText(VENUE_NOT_FOUND_MESSAGE)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Back to venues' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Venues' })).toBeInTheDocument()
    expect(path(router)).toBe('/t/venues')
  })

  it('an id that isn’t a number is a missing venue, without asking the server', async () => {
    renderApp('/t/venues/abc')
    expect(await screen.findByText(VENUE_NOT_FOUND_MESSAGE)).toBeInTheDocument()
  })

  it('a failed lookup shows the reason and recovers on Try again', async () => {
    let fail = true
    server.use(
      http.get('*/operator/api/venues/1', () =>
        fail ? HttpResponse.error() : HttpResponse.json({ data: gatewayVenue(), success: true }),
      ),
    )
    renderApp('/t/venues/1')
    expect(await screen.findByText(UNREACHABLE_MESSAGE)).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Skyline Rooftop' })).toBeInTheDocument()
  })

  it('a tenant admin who opens a super admin venue link is sent to their own area', async () => {
    mockList(() => onePage([]))
    const router = renderApp('/admin/venues/new')
    await screen.findByRole('heading', { level: 1 })
    expect(path(router)).toBe('/t')
  })
})
