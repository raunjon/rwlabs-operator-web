import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { loadSession, startSession } from '@/lib/session/session'
import { gatewayEvent } from '@/test/events'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { EVENT_NOT_FOUND_MESSAGE } from './events'
import { formatEventTime } from './format'
import { toLocalDateTime } from './schema'

// OW-14, tenant admin: /t/events. The super admin's differences are in admin-events-flow.test.tsx.

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

const VENUES = [
  { id: 1, name: 'Skyline Rooftop' },
  { id: 2, name: 'Courtyard Cafe' },
]

function mockVenues() {
  server.use(http.get('*/operator/api/venues', () => HttpResponse.json({ data: VENUES, success: true })))
}

type ListAnswer = { data: unknown[]; current_page?: number; total_pages?: number; total_count?: number }

function mockList(respond: (url: URL) => ListAnswer | Response | Promise<Response>) {
  const urls: URL[] = []
  server.use(
    http.get('*/operator/api/events', async ({ request }) => {
      const url = new URL(request.url)
      urls.push(url)
      const answer = await respond(url)
      return answer instanceof Response ? answer : HttpResponse.json({ success: true, ...answer })
    }),
  )
  return urls
}

function mockEvent(id: number, respond: () => Response | Promise<Response>) {
  server.use(http.get(`*/operator/api/events/${id}`, () => respond()))
}

function captureBodies(method: 'post' | 'patch', path: string, respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http[method](path, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      bodies.push(body)
      return respond(body)
    }),
  )
  return bodies
}

const onePage = (events: unknown[]): ListAnswer => ({
  data: events,
  current_page: 1,
  total_pages: events.length ? 1 : 0,
  total_count: events.length,
})

const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname
const search = (router: ReturnType<typeof renderApp>) => router.state.location.search as Record<string, unknown>

// datetime-local inputs take a whole value at once; typing character by character isn't how a browser fills them.
function setDateTime(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

beforeEach(() => {
  sessionStorage.clear()
  loadSession()
  startSession(makeJwt())
  mockVenues()
})

describe('finding the events page', () => {
  it('is reached from the sidebar’s Events link', async () => {
    mockList(() => onePage([]))
    const router = renderApp('/t')
    await userEvent.click(
      within(await screen.findByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Events' }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument()
    expect(path(router)).toBe('/t/events')
  })

  it('a super admin who opens it is sent to their own area', async () => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt({ role_name: 'super_admin', tenant_id: null }))
    const router = renderApp('/t/events')
    await waitFor(() => expect(path(router)).toBe('/admin'))
  })
})

describe('the events list', () => {
  it('shows a labelled skeleton while the list loads', async () => {
    mockList(async () => {
      await delay('infinite')
      return HttpResponse.json({})
    })
    renderApp('/t/events')
    expect(await screen.findByRole('status', { name: 'Loading events' })).toBeInTheDocument()
  })

  it('lists the tenant’s events, 25 a page, with no tenant filter and no Tenant column', async () => {
    const urls = mockList(() =>
      onePage([gatewayEvent(), gatewayEvent({ id: 13, title: 'Sunday Brunch Social', venue_id: 2, base_price: null })]),
    )
    renderApp('/t/events')
    const table = await screen.findByRole('table')
    const rows = await within(table).findAllByRole('row')
    expect(within(rows[0]).queryByRole('columnheader', { name: 'Tenant' })).not.toBeInTheDocument()
    expect(within(rows[0]).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Title',
      'Starts',
      'Venue',
      'Price',
    ])
    expect(within(rows[1]).getByRole('link', { name: 'Friday Rooftop Mixer' })).toBeInTheDocument()
    expect(within(rows[1]).getByText(formatEventTime(1793300400 * 1000))).toBeInTheDocument()
    expect(await within(rows[1]).findByText('Skyline Rooftop')).toBeInTheDocument()
    expect(within(rows[1]).getByText('1,500 base · 500 cover')).toBeInTheDocument()
    expect(await within(rows[2]).findByText('Courtyard Cafe')).toBeInTheDocument()
    expect(within(rows[2]).getByText('500 cover')).toBeInTheDocument()
    expect(urls[0].searchParams.get('per_page')).toBe('25')
    expect(urls[0].searchParams.has('tenant_id')).toBe(false)
  })

  it('an empty list says what to do next, with the primary action', async () => {
    mockList(() => onePage([]))
    const router = renderApp('/t/events')
    expect(await screen.findByText('No events yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Create your first event' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'New event' })).toBeInTheDocument()
    expect(path(router)).toBe('/t/events/new')
  })

  it('a failed list shows the reason and recovers on Try again', async () => {
    let fail = true
    mockList(() => (fail ? new HttpResponse('<html>Bad gateway</html>', { status: 502 }) : onePage([gatewayEvent()])))
    renderApp('/t/events')
    expect(await screen.findByText(UNREACHABLE_MESSAGE)).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: 'Friday Rooftop Mixer' })).toBeInTheDocument()
  })

  it('a failed venues lookup says so, with a retry, while the events still show', async () => {
    let venuesFail = true
    server.use(
      http.get('*/operator/api/venues', () =>
        venuesFail ? HttpResponse.error() : HttpResponse.json({ data: VENUES, success: true }),
      ),
    )
    mockList(() => onePage([gatewayEvent()]))
    renderApp('/t/events')
    expect(await screen.findByRole('link', { name: 'Friday Rooftop Mixer' })).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Venue names and the venue filter aren’t available.')
    expect(alert).toHaveTextContent(UNREACHABLE_MESSAGE)
    venuesFail = false
    await userEvent.click(screen.getByRole('button', { name: 'Reload venues' }))
    expect(await screen.findByText('Skyline Rooftop', { selector: 'td' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('while venues load, the venue filter and venue names are announced placeholders', async () => {
    let releaseVenues!: () => void
    const venuesReady = new Promise<void>((resolve) => (releaseVenues = resolve))
    server.use(
      http.get('*/operator/api/venues', async () => {
        await venuesReady
        return HttpResponse.json({ data: VENUES, success: true })
      }),
    )
    mockList(() => onePage([gatewayEvent()]))
    renderApp('/t/events')
    expect(await screen.findByRole('link', { name: 'Friday Rooftop Mixer' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading venues' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Venue')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Venue \d+$/)).not.toBeInTheDocument()
    releaseVenues()
    expect(await screen.findByText('Skyline Rooftop', { selector: 'td' })).toBeInTheDocument()
    expect(screen.getByLabelText('Venue')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading venues' })).not.toBeInTheDocument()
  })

  it('a page or filter change shows the loading skeleton, not the previous rows', async () => {
    let releasePage2!: () => void
    const page2Ready = new Promise<void>((resolve) => (releasePage2 = resolve))
    mockList(async (url) => {
      const page = Number(url.searchParams.get('page'))
      if (page === 2) await page2Ready
      return HttpResponse.json({
        success: true,
        data: [gatewayEvent({ id: page, title: `Event on page ${page}` })],
        current_page: page,
        total_pages: 2,
        total_count: 26,
      })
    })
    renderApp('/t/events')
    await userEvent.click(await screen.findByRole('link', { name: 'Next page' }))
    expect(await screen.findByRole('status', { name: 'Loading events' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Event on page 1' })).not.toBeInTheDocument()
    releasePage2()
    expect(await screen.findByRole('link', { name: 'Event on page 2' })).toBeInTheDocument()
  })

  it('search and venue filters live in the URL and go to the server; Clear filters drops them', async () => {
    const urls = mockList(() => onePage([gatewayEvent()]))
    const router = renderApp('/t/events')
    const filters = await screen.findByRole('search', { name: 'Filter events' })
    await userEvent.type(within(filters).getByLabelText('Search'), 'rooftop')
    await within(filters).findByRole('option', { name: 'Skyline Rooftop' })
    await userEvent.selectOptions(within(filters).getByLabelText('Venue'), 'Skyline Rooftop')
    await userEvent.click(within(filters).getByRole('button', { name: 'Apply filters' }))

    await waitFor(() => expect(search(router)).toEqual({ search: 'rooftop', venue_id: 1 }))
    await waitFor(() => expect(urls.at(-1)!.searchParams.get('search')).toBe('rooftop'))
    expect(urls.at(-1)!.searchParams.get('venue_id')).toBe('1')

    await userEvent.click(within(filters).getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(search(router)).toEqual({}))
    expect(within(filters).getByLabelText('Search')).toHaveValue('')
    await waitFor(() => expect(urls.at(-1)!.searchParams.has('search')).toBe(false))
  })

  it('opening a filtered link fills the filter form from the URL', async () => {
    mockList(() => onePage([]))
    renderApp('/t/events?search=brunch&venue_id=2')
    expect(await screen.findByLabelText('Search')).toHaveValue('brunch')
    await waitFor(() => expect(screen.getByLabelText('Venue')).toHaveValue('2'))
    expect(await screen.findByText('No events match these filters.')).toBeInTheDocument()
  })

  it('pages through the list with Next and Previous', async () => {
    const urls = mockList((url) => {
      const page = Number(url.searchParams.get('page'))
      return { data: [gatewayEvent({ id: page, title: `Event on page ${page}` })], current_page: page, total_pages: 3, total_count: 51 }
    })
    const router = renderApp('/t/events')
    expect(await screen.findByText('Page 1 of 3 · 51 events')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Previous page' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Next page' }))
    expect(await screen.findByRole('link', { name: 'Event on page 2' })).toBeInTheDocument()
    expect(search(router)).toEqual({ page: 2 })
    expect(urls.at(-1)!.searchParams.get('page')).toBe('2')
    await userEvent.click(screen.getByRole('link', { name: 'Previous page' }))
    expect(await screen.findByRole('link', { name: 'Event on page 1' })).toBeInTheDocument()
  })

  it('a page past the end says so and links back to the first page', async () => {
    mockList((url) => (url.searchParams.get('page') === '9' ? { data: [] } : onePage([gatewayEvent()])))
    const router = renderApp('/t/events?page=9')
    await userEvent.click(await screen.findByRole('link', { name: 'Go to the first page' }))
    expect(await screen.findByRole('link', { name: 'Friday Rooftop Mixer' })).toBeInTheDocument()
    expect(search(router)).toEqual({})
  })

  it('a row’s title opens the event', async () => {
    mockList(() => onePage([gatewayEvent()]))
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent(), success: true }))
    const router = renderApp('/t/events')
    await userEvent.click(await screen.findByRole('link', { name: 'Friday Rooftop Mixer' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday Rooftop Mixer' })).toBeInTheDocument()
    expect(path(router)).toBe('/t/events/12')
  })
})

describe('creating an event', () => {
  async function fillValidForm() {
    await userEvent.type(await screen.findByLabelText('Title'), 'Friday Rooftop Mixer')
    setDateTime('Starts', '2026-10-29T19:00')
    setDateTime('Ends', '2026-10-29T23:00')
    // The venue options arrive with the venues query.
    await screen.findByRole('option', { name: 'Skyline Rooftop' })
    await userEvent.selectOptions(screen.getByLabelText('Venue'), 'Skyline Rooftop')
  }

  it('has no Tenant id field, sends no tenant_id, and goes back to the list', async () => {
    mockList(() => onePage([]))
    const bodies = captureBodies('post', '*/operator/api/events', () =>
      HttpResponse.json({ data: gatewayEvent({ id: 30 }), success: true }),
    )
    const router = renderApp('/t/events/new')
    await fillValidForm()
    expect(screen.queryByLabelText(/tenant/i)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Base price (optional)'), '1500')
    await userEvent.type(screen.getByLabelText('Max tickets (optional)'), '80')
    await userEvent.type(screen.getByLabelText('Features'), 'welcome drink{Enter}')
    await userEvent.type(screen.getByLabelText('Features'), 'icebreakers')
    await userEvent.click(screen.getByRole('button', { name: 'Add feature' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }))

    await waitFor(() => expect(path(router)).toBe('/t/events'))
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).not.toHaveProperty('tenant_id')
    expect(bodies[0]).toMatchObject({
      title: 'Friday Rooftop Mixer',
      venue_id: 1,
      base_price: 1500,
      cover_price: 0,
      max_tickets: 80,
      features: ['welcome drink', 'icebreakers'],
      start_time: new Date(2026, 9, 29, 19, 0).toISOString(),
      end_time: new Date(2026, 9, 29, 23, 0).toISOString(),
    })
  })

  it('checks the form in the browser first and sends nothing while it’s wrong', async () => {
    const bodies = captureBodies('post', '*/operator/api/events', () => HttpResponse.json({}))
    renderApp('/t/events/new')
    await screen.findByLabelText('Title')
    setDateTime('Starts', '2026-10-29T19:00')
    setDateTime('Ends', '2026-10-29T18:00')
    await userEvent.clear(screen.getByLabelText('Cover price'))
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }))
    expect(await screen.findByText('Enter a title')).toBeInTheDocument()
    expect(screen.getByText('Pick a venue')).toBeInTheDocument()
    expect(screen.getByText('The end must be after the start')).toBeInTheDocument()
    expect(screen.getByText('Enter a price of 0 or more')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(bodies).toHaveLength(0)
  })

  it('shows the server’s validation message at form level and keeps the form', async () => {
    captureBodies('post', '*/operator/api/events', () => envelope(422, "Venue must exist, Title can't be blank"))
    const router = renderApp('/t/events/new')
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Venue must exist, Title can't be blank")
    expect(path(router)).toBe('/t/events/new')
    expect(screen.getByLabelText('Title')).toHaveValue('Friday Rooftop Mixer')
  })

  it('disables the form while the request is in flight', async () => {
    captureBodies('post', '*/operator/api/events', async () => {
      await delay('infinite')
      return HttpResponse.json({})
    })
    renderApp('/t/events/new')
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }))
    expect(await screen.findByRole('button', { name: 'Creating event…' })).toBeDisabled()
    expect(screen.getByLabelText('Title')).toBeDisabled()
  })

  it('a network failure shows the unreachable message', async () => {
    server.use(http.post('*/operator/api/events', () => HttpResponse.error()))
    renderApp('/t/events/new')
    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE_MESSAGE)
  })

  it('shows a labelled skeleton for the venue while venues load', async () => {
    server.use(
      http.get('*/operator/api/venues', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    renderApp('/t/events/new')
    expect(await screen.findByRole('status', { name: 'Loading venues' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Venue')).not.toBeInTheDocument()
  })

  it('a feature can be removed again before saving, and duplicates are ignored', async () => {
    renderApp('/t/events/new')
    await userEvent.type(await screen.findByLabelText('Features'), 'live band{Enter}live band{Enter}')
    expect(screen.getAllByText('live band')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Remove live band' }))
    expect(screen.queryByText('live band')).not.toBeInTheDocument()
  })
})

describe('viewing and editing an event', () => {
  it('fills the form from the event and saves changes in place', async () => {
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent(), success: true }))
    const bodies = captureBodies('patch', '*/operator/api/events/12', (body) =>
      HttpResponse.json({ data: gatewayEvent({ title: body.title }), success: true }),
    )
    const router = renderApp('/t/events/12')
    const title = await screen.findByLabelText('Title')
    expect(title).toHaveValue('Friday Rooftop Mixer')
    expect(screen.getByLabelText('Starts')).toHaveValue(toLocalDateTime(1793300400 * 1000))
    await waitFor(() => expect(screen.getByLabelText('Venue')).toHaveValue('1'))
    expect(screen.getByLabelText('Base price (optional)')).toHaveValue('1500.0')
    expect(screen.getByText('welcome_drink')).toBeInTheDocument()
    expect(screen.queryByText(/tenant/i)).not.toBeInTheDocument()

    await userEvent.clear(title)
    await userEvent.type(title, 'Friday Rooftop Mixer II')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Event saved.')).toHaveAttribute('role', 'status')
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday Rooftop Mixer II' })).toBeInTheDocument()
    expect(path(router)).toBe('/t/events/12')
    expect(bodies[0]).toMatchObject({ title: 'Friday Rooftop Mixer II', features: ['welcome_drink', 'icebreakers'] })
    expect(bodies[0]).not.toHaveProperty('tenant_id')
  })

  it('won’t send an emptied feature list: the gateway can’t clear it yet', async () => {
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent({ features: ['welcome_drink'] }), success: true }))
    const bodies = captureBodies('patch', '*/operator/api/events/12', () => HttpResponse.json({}))
    renderApp('/t/events/12')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove welcome_drink' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      await screen.findByText('Keep at least one feature: removing them all isn’t supported yet.'),
    ).toBeInTheDocument()
    expect(bodies).toHaveLength(0)
  })

  it('coming back to an event waits for its fresh copy before filling the form', async () => {
    let title = 'Friday Rooftop Mixer'
    let releaseSecondVisit!: () => void
    const secondVisit = new Promise<void>((resolve) => (releaseSecondVisit = resolve))
    let visits = 0
    mockEvent(12, async () => {
      visits += 1
      if (visits > 1) await secondVisit
      return HttpResponse.json({ data: gatewayEvent({ title }), success: true })
    })
    mockList(() => onePage([gatewayEvent()]))
    const router = renderApp('/t/events/12')
    expect(await screen.findByLabelText('Title')).toHaveValue('Friday Rooftop Mixer')

    await userEvent.click(screen.getByRole('link', { name: 'All events' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument()
    title = 'Renamed by someone else'
    router.history.back()

    expect(await screen.findByRole('status', { name: 'Loading the event' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    releaseSecondVisit()
    expect(await screen.findByLabelText('Title')).toHaveValue('Renamed by someone else')
  })

  it('once a save stores the first feature, removing it again is refused like any other', async () => {
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent({ features: [] }), success: true }))
    const bodies = captureBodies('patch', '*/operator/api/events/12', (body) =>
      HttpResponse.json({ data: gatewayEvent({ features: body.features as string[] }), success: true }),
    )
    renderApp('/t/events/12')
    await userEvent.type(await screen.findByLabelText('Features'), 'live band{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Event saved.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove live band' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      await screen.findByText('Keep at least one feature: removing them all isn’t supported yet.'),
    ).toBeInTheDocument()
    expect(bodies).toHaveLength(1)
  })

  it('“Event saved.” goes away at the next edit', async () => {
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent(), success: true }))
    captureBodies('patch', '*/operator/api/events/12', (body) =>
      HttpResponse.json({ data: gatewayEvent({ title: body.title }), success: true }),
    )
    renderApp('/t/events/12')
    const title = await screen.findByLabelText('Title')
    await userEvent.type(title, '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Event saved.')).toBeInTheDocument()
    await userEvent.type(title, '?')
    expect(screen.queryByText('Event saved.')).not.toBeInTheDocument()
  })

  it('a missing event says so and links back to the list', async () => {
    mockEvent(99, () => envelope(404, "Couldn't find Event with 'id'=99"))
    mockList(() => onePage([gatewayEvent()]))
    const router = renderApp('/t/events/99')
    expect(await screen.findByText(EVENT_NOT_FOUND_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Back to events' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Events' })).toBeInTheDocument()
    expect(path(router)).toBe('/t/events')
  })

  it('an id that isn’t a number is a missing event, without asking the server', async () => {
    renderApp('/t/events/abc')
    expect(await screen.findByText(EVENT_NOT_FOUND_MESSAGE)).toBeInTheDocument()
  })

  it('a failed save shows the server’s message and keeps the edits', async () => {
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent(), success: true }))
    captureBodies('patch', '*/operator/api/events/12', () => envelope(422, 'End time must be after start time'))
    renderApp('/t/events/12')
    const title = await screen.findByLabelText('Title')
    await userEvent.type(title, '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('End time must be after start time')
    expect(title).toHaveValue('Friday Rooftop Mixer!')
  })
})

describe('deleting an event', () => {
  function mockDelete(respond: () => Response) {
    const calls: string[] = []
    server.use(
      http.delete('*/operator/api/events/:id', ({ params }) => {
        calls.push(String(params.id))
        return respond()
      }),
    )
    return calls
  }

  it('asks to confirm first; Cancel sends nothing', async () => {
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent(), success: true }))
    const calls = mockDelete(() => HttpResponse.json({ data: gatewayEvent(), success: true }))
    renderApp('/t/events/12')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete event' }))
    const confirm = screen.getByRole('group', { name: 'Confirm delete' })
    expect(confirm).toHaveTextContent('Delete “Friday Rooftop Mixer”? This can’t be undone.')
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Confirm delete' })).not.toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('once confirmed, deletes and goes back to a fresh list', async () => {
    let deleted = false
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent(), success: true }))
    mockList(() => onePage(deleted ? [] : [gatewayEvent()]))
    const calls = mockDelete(() => {
      deleted = true
      return HttpResponse.json({ data: gatewayEvent(), success: true })
    })
    const router = renderApp('/t/events/12')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete event' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete event' }))
    await waitFor(() => expect(path(router)).toBe('/t/events'))
    expect(calls).toEqual(['12'])
    expect(await screen.findByText('No events yet.')).toBeInTheDocument()
  })

  it('a 404 on delete shows the not-found message', async () => {
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent(), success: true }))
    mockDelete(() => envelope(404, "Couldn't find Event with 'id'=12"))
    renderApp('/t/events/12')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete event' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete event' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(EVENT_NOT_FOUND_MESSAGE)
  })

  it('an event other records depend on keeps the server’s reason', async () => {
    mockEvent(12, () => HttpResponse.json({ data: gatewayEvent(), success: true }))
    mockDelete(() => envelope(422, 'This record cannot be deleted because other records depend on it.'))
    renderApp('/t/events/12')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete event' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete event' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This record cannot be deleted because other records depend on it.',
    )
  })
})
