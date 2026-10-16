import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError, NO_RESPONSE } from '@/lib/api/errors'
import { loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { gatewayVenue } from '@/test/venues'
import {
  fetchVenue,
  fetchVenuePage,
  requestCreateVenue,
  requestDeleteVenue,
  requestUpdateVenue,
  VENUES_PER_PAGE,
  type VenueInput,
} from './api'

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

const input = (overrides: Partial<VenueInput> = {}): VenueInput => ({
  name: 'Skyline Rooftop',
  subtitle: '',
  description: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  latitude: null,
  longitude: null,
  totalCapacity: null,
  seatingCapacity: null,
  pocName: '',
  pocMobile: '',
  pocEmail: '',
  website: '',
  zomatoUrl: '',
  imageUrl: '',
  amenities: [],
  isActive: true,
  ...overrides,
})

function captureBodies(method: 'post' | 'patch', path: string) {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json({ data: gatewayVenue(), success: true })
    }),
  )
  return bodies
}

beforeEach(() => {
  sessionStorage.clear()
  loadSession()
  startSession(makeJwt())
})

describe('fetchVenuePage', () => {
  it('asks for 25 a page and reads the operator’s snake_case pagination keys', async () => {
    let url: URL | null = null
    server.use(
      http.get('*/operator/api/venues', ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({ data: [gatewayVenue()], success: true, current_page: 2, total_pages: 3, total_count: 51 })
      }),
    )
    const page = await fetchVenuePage(2)
    expect(VENUES_PER_PAGE).toBe(25)
    expect(url!.searchParams.get('page')).toBe('2')
    expect(url!.searchParams.get('per_page')).toBe('25')
    expect(page).toMatchObject({ currentPage: 2, totalPages: 3, totalCount: 51 })
    expect(page.venues).toHaveLength(1)
  })

  it('reads every venue field; decimals stay as the server wrote them and blank amenities are dropped', async () => {
    server.use(
      http.get('*/operator/api/venues', () =>
        HttpResponse.json({ data: [gatewayVenue({ amenities: ['parking', ''] })], success: true }),
      ),
    )
    const { venues, totalPages } = await fetchVenuePage(1)
    expect(totalPages).toBeNull()
    expect(venues[0]).toEqual({
      id: 1,
      name: 'Skyline Rooftop',
      subtitle: 'Open-air bar',
      description: 'Rooftop lounge with a city view',
      addressLine1: '14 Hill Road',
      addressLine2: '',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400050',
      country: 'India',
      latitude: '19.059600',
      longitude: '72.829500',
      totalCapacity: 120,
      seatingCapacity: 80,
      pocName: 'Rohan Mehta',
      pocMobile: '+91 98200 00000',
      pocEmail: 'rohan@skyline.example',
      website: 'https://skyline.example',
      zomatoUrl: '',
      imageUrl: '',
      amenities: ['parking'],
      isActive: true,
    })
  })

  it('a venue without is_active counts as active, the column’s default', async () => {
    const withoutFlag: Record<string, unknown> = gatewayVenue()
    delete withoutFlag.is_active
    server.use(http.get('*/operator/api/venues', () => HttpResponse.json({ data: [withoutFlag], success: true })))
    expect((await fetchVenuePage(1)).venues[0].isActive).toBe(true)
  })

  it('an answer that isn’t the envelope is an unexpected response', async () => {
    server.use(http.get('*/operator/api/venues', () => HttpResponse.json({ data: { id: 1 } })))
    await expect(fetchVenuePage(1)).rejects.toMatchObject({ message: 'The server sent an unexpected response' })
  })
})

describe('fetchVenue', () => {
  it('reads the venue from the envelope', async () => {
    server.use(http.get('*/operator/api/venues/1', () => HttpResponse.json({ data: gatewayVenue(), success: true })))
    expect((await fetchVenue(1)).name).toBe('Skyline Rooftop')
  })

  it('a 404 is an ApiError with the server’s status', async () => {
    server.use(http.get('*/operator/api/venues/99', () => envelope(404, "Couldn't find Venue with 'id'=99")))
    await expect(fetchVenue(99)).rejects.toMatchObject({ status: 404 })
  })

  it('an HTML error page from a proxy is still an ApiError with its status', async () => {
    server.use(http.get('*/operator/api/venues/1', () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })))
    await expect(fetchVenue(1)).rejects.toMatchObject({ status: 502 })
  })

  it('a network failure is NO_RESPONSE', async () => {
    server.use(http.get('*/operator/api/venues/1', () => HttpResponse.error()))
    await expect(fetchVenue(1)).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})

describe('requestCreateVenue', () => {
  it('sends the operator’s permitted params, leaving out what the admin left empty', async () => {
    const bodies = captureBodies('post', '*/operator/api/venues')
    await requestCreateVenue(
      input({
        name: 'Skyline Rooftop',
        city: 'Mumbai',
        latitude: 19.0596,
        longitude: 72.8295,
        totalCapacity: 120,
        seatingCapacity: 0,
        amenities: ['parking'],
        isActive: false,
      }),
    )
    expect(bodies[0]).toEqual({
      name: 'Skyline Rooftop',
      city: 'Mumbai',
      latitude: 19.0596,
      longitude: 72.8295,
      total_capacity: 120,
      seating_capacity: 0,
      amenities: ['parking'],
      is_active: false,
    })
  })

  it('a validation failure is a 422 ApiError with the joined message', async () => {
    server.use(http.post('*/operator/api/venues', () => envelope(422, "Name can't be blank")))
    await expect(requestCreateVenue(input())).rejects.toEqual(new ApiError(422, "Name can't be blank"))
  })

  it('gives up when the answer never comes', async () => {
    server.use(
      http.post('*/operator/api/venues', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )
    await expect(requestCreateVenue(input(), 20)).rejects.toMatchObject({ status: NO_RESPONSE })
  })
})

describe('requestUpdateVenue', () => {
  it('sends every field: empty text as "", empty numbers as null so they clear; no amenities when there are none', async () => {
    const bodies = captureBodies('patch', '*/operator/api/venues/1')
    await requestUpdateVenue(1, input({ name: 'Skyline', city: 'Mumbai' }))
    expect(bodies[0]).toEqual({
      name: 'Skyline',
      subtitle: '',
      description: '',
      address_line1: '',
      address_line2: '',
      city: 'Mumbai',
      state: '',
      postal_code: '',
      country: '',
      latitude: null,
      longitude: null,
      total_capacity: null,
      seating_capacity: null,
      poc_name: '',
      poc_mobile: '',
      poc_email: '',
      website: '',
      zomato_url: '',
      image_url: '',
      is_active: true,
    })
  })

  it('sends the amenities when there are some', async () => {
    const bodies = captureBodies('patch', '*/operator/api/venues/1')
    await requestUpdateVenue(1, input({ amenities: ['parking', 'valet'] }))
    expect(bodies[0].amenities).toEqual(['parking', 'valet'])
  })
})

describe('requestDeleteVenue', () => {
  it('deletes the venue', async () => {
    let deleted = false
    server.use(
      http.delete('*/operator/api/venues/1', () => {
        deleted = true
        return HttpResponse.json({ data: gatewayVenue(), success: true })
      }),
    )
    await requestDeleteVenue(1)
    expect(deleted).toBe(true)
  })

  it('a venue with events is refused with the operator’s 422', async () => {
    server.use(
      http.delete('*/operator/api/venues/1', () => envelope(422, 'Cannot delete record because dependent events exist')),
    )
    await expect(requestDeleteVenue(1)).rejects.toEqual(
      new ApiError(422, 'Cannot delete record because dependent events exist'),
    )
  })
})
