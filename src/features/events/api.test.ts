import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import { loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { gatewayEvent } from '@/test/events'
import { server } from '@/test/msw'
import {
  EVENTS_PER_PAGE,
  fetchEvent,
  fetchEvents,
  fetchVenues,
  requestCreateEvent,
  requestDeleteEvent,
  requestUpdateEvent,
  type EventInput,
} from './api'

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

const input = (overrides: Partial<EventInput> = {}): EventInput => ({
  title: 'Friday Rooftop Mixer',
  description: '',
  startTime: Date.UTC(2026, 9, 29, 13, 30),
  endTime: Date.UTC(2026, 9, 29, 17, 30),
  venueId: 1,
  area: '',
  imageUrlVertical: '',
  imageUrlHorizontal: '',
  basePrice: null,
  coverPrice: 0,
  maxTickets: null,
  maxMaleTickets: null,
  maxFemaleTickets: null,
  features: [],
  ...overrides,
})

beforeEach(() => {
  sessionStorage.clear()
  loadSession()
  startSession(makeJwt())
})

describe('fetchEvents', () => {
  it('asks for 25 a page and reads the operator’s snake_case pagination keys', async () => {
    let url: URL | null = null
    server.use(
      http.get('*/operator/api/events', ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({
          data: [gatewayEvent()],
          success: true,
          current_page: 2,
          total_pages: 3,
          total_count: 51,
        })
      }),
    )
    const page = await fetchEvents({ page: 2 })
    expect(EVENTS_PER_PAGE).toBe(25)
    expect(url!.searchParams.get('per_page')).toBe('25')
    expect(url!.searchParams.get('page')).toBe('2')
    expect(page).toMatchObject({ currentPage: 2, totalPages: 3, totalCount: 51 })
    expect(page.events).toHaveLength(1)
  })

  it('turns the gateway’s event into the panel’s shape (times in ms, prices kept as the server wrote them)', async () => {
    server.use(
      http.get('*/operator/api/events', () =>
        HttpResponse.json({ data: [gatewayEvent()], success: true, current_page: 1, total_pages: 1, total_count: 1 }),
      ),
    )
    const [event] = (await fetchEvents({})).events
    expect(event).toEqual({
      id: 12,
      title: 'Friday Rooftop Mixer',
      description: 'Drinks on the roof',
      startTime: 1793300400 * 1000,
      endTime: 1793314800 * 1000,
      venueId: 1,
      area: 'Bandra',
      imageUrlVertical: '',
      imageUrlHorizontal: '',
      basePrice: '1500.0',
      coverPrice: '500.0',
      maxTickets: null,
      maxMaleTickets: 40,
      maxFemaleTickets: 40,
      features: ['welcome_drink', 'icebreakers'],
      tenantId: 3,
    })
  })

  it('sends search, venue and tenant filters only when they are set', async () => {
    const urls: URL[] = []
    server.use(
      http.get('*/operator/api/events', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ data: [], success: true, current_page: 1, total_pages: 0, total_count: 0 })
      }),
    )
    await fetchEvents({ search: 'rooftop', venueId: 4, tenantId: 9 })
    await fetchEvents({ search: '' })
    expect(Object.fromEntries(urls[0].searchParams)).toEqual({
      page: '1',
      per_page: '25',
      search: 'rooftop',
      venue_id: '4',
      tenant_id: '9',
    })
    // An empty venue_id or tenant_id matches nothing on the operator, so a blank filter must not be sent at all.
    expect(Object.fromEntries(urls[1].searchParams)).toEqual({ page: '1', per_page: '25' })
  })

  it('a page past the end comes back without pagination keys: no total, page as asked', async () => {
    server.use(http.get('*/operator/api/events', () => HttpResponse.json({ data: [], success: true })))
    expect(await fetchEvents({ page: 7 })).toEqual({ events: [], currentPage: 7, totalPages: null, totalCount: null })
  })

  it('drops filler features the gateway can leave behind ([""] for a cleared list)', async () => {
    server.use(
      http.get('*/operator/api/events', () =>
        HttpResponse.json({ data: [gatewayEvent({ features: [''] })], success: true, total_pages: 1 }),
      ),
    )
    expect((await fetchEvents({})).events[0].features).toEqual([])
  })

  it('rejects an envelope without a data list', async () => {
    server.use(http.get('*/operator/api/events', () => HttpResponse.json({ success: true })))
    await expect(fetchEvents({})).rejects.toMatchObject({ status: 200 })
  })

  it('carries the server’s status and message on failure', async () => {
    server.use(http.get('*/operator/api/events', () => envelope(403, 'You are not authorized to view or edit this content.')))
    await expect(fetchEvents({})).rejects.toEqual(new ApiError(403, 'You are not authorized to view or edit this content.'))
  })

  it('a proxy HTML error page becomes a status-only error, never the HTML', async () => {
    server.use(
      http.get('*/operator/api/events', () => new HttpResponse('<html>Bad Gateway</html>', { status: 502 })),
    )
    await expect(fetchEvents({})).rejects.toEqual(new ApiError(502, 'Request failed (502)'))
  })

  it('a network error becomes NO_RESPONSE', async () => {
    server.use(http.get('*/operator/api/events', () => HttpResponse.error()))
    await expect(fetchEvents({})).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})

describe('fetchEvent', () => {
  it('reads one event', async () => {
    server.use(http.get('*/operator/api/events/12', () => HttpResponse.json({ data: gatewayEvent(), success: true })))
    expect(await fetchEvent(12)).toMatchObject({ id: 12, title: 'Friday Rooftop Mixer' })
  })

  it('keeps the 404 status', async () => {
    server.use(http.get('*/operator/api/events/99', () => envelope(404, "Couldn't find Event with 'id'=99")))
    await expect(fetchEvent(99)).rejects.toMatchObject({ status: 404 })
  })
})

describe('fetchVenues', () => {
  it('asks for every venue in one go (page=0) and keeps id and name', async () => {
    let url: URL | null = null
    server.use(
      http.get('*/operator/api/venues', ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({
          data: [
            { id: 1, name: 'Skyline Rooftop', city: 'Mumbai' },
            { id: 2, name: 'Courtyard Cafe' },
          ],
          success: true,
        })
      }),
    )
    expect(await fetchVenues()).toEqual([
      { id: 1, name: 'Skyline Rooftop' },
      { id: 2, name: 'Courtyard Cafe' },
    ])
    expect(url!.searchParams.get('page')).toBe('0')
  })
})

describe('requestCreateEvent', () => {
  function captureCreate() {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post('*/operator/api/events', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ data: gatewayEvent({ id: 30 }), success: true })
      }),
    )
    return bodies
  }

  it('sends the times as ISO 8601 and never a tenant_id unless one is given', async () => {
    const bodies = captureCreate()
    const created = await requestCreateEvent(
      input({ basePrice: 1500, coverPrice: 500, maxTickets: 80, features: ['welcome_drink'] }),
    )
    expect(created.id).toBe(30)
    expect(bodies[0]).toEqual({
      title: 'Friday Rooftop Mixer',
      description: '',
      start_time: '2026-10-29T13:30:00.000Z',
      end_time: '2026-10-29T17:30:00.000Z',
      venue_id: 1,
      area: '',
      image_url_vertical: '',
      image_url_horizontal: '',
      base_price: 1500,
      cover_price: 500,
      max_tickets: 80,
      features: ['welcome_drink'],
    })
  })

  it('leaves unset numbers out of a create (the gateway types them as optional numbers, not null)', async () => {
    const bodies = captureCreate()
    await requestCreateEvent(input())
    for (const key of ['base_price', 'max_tickets', 'max_male_tickets', 'max_female_tickets']) {
      expect(bodies[0]).not.toHaveProperty(key)
    }
  })

  it('sends tenant_id when the super admin gives one', async () => {
    const bodies = captureCreate()
    await requestCreateEvent(input({ tenantId: 9 }))
    expect(bodies[0].tenant_id).toBe(9)
  })

  it('leaves an empty feature list out: the gateway would store it as [""]', async () => {
    const bodies = captureCreate()
    await requestCreateEvent(input({ features: [] }))
    expect(bodies[0]).not.toHaveProperty('features')
  })

  it('carries a 422 validation message', async () => {
    server.use(
      http.post('*/operator/api/events', () =>
        envelope(422, "Title can't be blank, End time must be after start time"),
      ),
    )
    await expect(requestCreateEvent(input())).rejects.toEqual(
      new ApiError(422, "Title can't be blank, End time must be after start time"),
    )
  })

  it('a request that never gets an answer times out as NO_RESPONSE', async () => {
    server.use(
      http.post('*/operator/api/events', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await expect(requestCreateEvent(input(), 20)).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})

describe('requestUpdateEvent', () => {
  it('PATCHes the event and never sends tenant_id (it can’t be changed)', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.patch('*/operator/api/events/12', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ data: gatewayEvent({ title: 'Renamed' }), success: true })
      }),
    )
    const updated = await requestUpdateEvent(12, input({ title: 'Renamed', tenantId: 9 }))
    expect(updated.title).toBe('Renamed')
    expect(bodies[0]).not.toHaveProperty('tenant_id')
    expect(bodies[0].title).toBe('Renamed')
  })

  it('sends null for a number the admin emptied, so the update clears it rather than keeping the old value', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.patch('*/operator/api/events/12', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ data: gatewayEvent(), success: true })
      }),
    )
    await requestUpdateEvent(12, input({ basePrice: null, maxTickets: null }))
    expect(bodies[0]).toMatchObject({ base_price: null, max_tickets: null, max_male_tickets: null, max_female_tickets: null })
  })
})

describe('requestDeleteEvent', () => {
  it('DELETEs the event', async () => {
    let called = false
    server.use(
      http.delete('*/operator/api/events/12', () => {
        called = true
        return HttpResponse.json({ data: gatewayEvent(), success: true })
      }),
    )
    await requestDeleteEvent(12)
    expect(called).toBe(true)
  })

  it('keeps the 404 status', async () => {
    server.use(http.delete('*/operator/api/events/12', () => envelope(404, "Couldn't find Event with 'id'=12")))
    await expect(requestDeleteEvent(12)).rejects.toMatchObject({ status: 404 })
  })
})
