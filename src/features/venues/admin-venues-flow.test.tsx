import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { gatewayVenue } from '@/test/venues'
import { HAS_EVENTS_MESSAGE, HAS_EVENTS_SERVER_MESSAGE, VENUE_NOT_FOUND_MESSAGE } from './venues'

// OW-15, super admin: /admin/venues. The same list and view as the tenant area (venues-flow.test.tsx), plus
// New venue, Edit and Delete.

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

function mockList(venues: () => unknown[]) {
  let requests = 0
  server.use(
    http.get('*/operator/api/venues', () => {
      requests += 1
      const data = venues()
      return HttpResponse.json({ data, success: true, current_page: 1, total_pages: 1, total_count: data.length })
    }),
  )
  return () => requests
}

function mockVenue(id: number, respond: () => Response | Promise<Response>) {
  server.use(http.get(`*/operator/api/venues/${id}`, () => respond()))
}

function captureBodies(
  method: 'post' | 'patch',
  path: string,
  respond: (body: Record<string, unknown>) => Response | Promise<Response>,
) {
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

const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname

beforeEach(() => {
  sessionStorage.clear()
  loadSession()
  startSession(makeJwt({ role_name: 'super_admin', tenant_id: null }))
})

describe('the super admin’s venues list', () => {
  it('is reached from the sidebar, and offers New venue', async () => {
    mockList(() => [gatewayVenue()])
    const router = renderApp('/admin')
    await userEvent.click(await screen.findByRole('link', { name: 'Venues' }))
    expect(await screen.findByRole('link', { name: 'Skyline Rooftop' })).toBeInTheDocument()
    expect(path(router)).toBe('/admin/venues')
    await userEvent.click(screen.getByRole('link', { name: 'New venue' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'New venue' })).toBeInTheDocument()
    expect(path(router)).toBe('/admin/venues/new')
  })

  it('an empty list offers to add the first venue', async () => {
    mockList(() => [])
    renderApp('/admin/venues')
    expect(await screen.findByText('No venues yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your first venue' })).toBeInTheDocument()
  })
})

describe('adding a venue', () => {
  it('sends the filled-in fields and goes back to a fresh list that shows it', async () => {
    const venues = [gatewayVenue()]
    const listRequests = mockList(() => venues)
    const bodies = captureBodies('post', '*/operator/api/venues', (body) => {
      const created = gatewayVenue({ ...body, id: 7 })
      venues.push(created)
      return HttpResponse.json({ data: created, success: true })
    })
    const router = renderApp('/admin/venues')
    await screen.findByRole('link', { name: 'Skyline Rooftop' })
    const before = listRequests()
    await userEvent.click(screen.getByRole('link', { name: 'New venue' }))

    expect(await screen.findByLabelText('Active')).toBeChecked()
    await userEvent.type(screen.getByLabelText('Name'), 'Courtyard Cafe')
    await userEvent.type(screen.getByLabelText('City (optional)'), 'Pune')
    await userEvent.type(screen.getByLabelText('Latitude (optional)'), '18.5204')
    await userEvent.type(screen.getByLabelText('Longitude (optional)'), '73.8567')
    await userEvent.type(screen.getByLabelText('Seating capacity (optional)'), '40')
    await userEvent.type(screen.getByLabelText('Amenities'), 'garden{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Create venue' }))

    expect(await screen.findByRole('link', { name: 'Courtyard Cafe' })).toBeInTheDocument()
    expect(path(router)).toBe('/admin/venues')
    expect(listRequests()).toBeGreaterThan(before)
    expect(bodies[0]).toEqual({
      name: 'Courtyard Cafe',
      city: 'Pune',
      latitude: 18.5204,
      longitude: 73.8567,
      seating_capacity: 40,
      amenities: ['garden'],
      is_active: true,
    })
  })

  it('checks the form in the browser first and sends nothing while it’s wrong', async () => {
    const bodies = captureBodies('post', '*/operator/api/venues', () => HttpResponse.json({}))
    renderApp('/admin/venues/new')
    await userEvent.type(await screen.findByLabelText('Latitude (optional)'), '95')
    await userEvent.type(screen.getByLabelText('Total capacity (optional)'), 'lots')
    await userEvent.click(screen.getByRole('button', { name: 'Create venue' }))
    expect(await screen.findByText('Enter a name')).toBeInTheDocument()
    expect(screen.getByText('Enter a latitude between -90 and 90')).toBeInTheDocument()
    expect(screen.getByText('Enter a whole number of 0 or more')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(bodies).toHaveLength(0)
  })

  it('shows the server’s validation message at form level and keeps the form', async () => {
    captureBodies('post', '*/operator/api/venues', () => envelope(422, "Name can't be blank"))
    renderApp('/admin/venues/new')
    await userEvent.type(await screen.findByLabelText('Name'), 'Courtyard Cafe')
    await userEvent.click(screen.getByRole('button', { name: 'Create venue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Name can't be blank")
    expect(screen.getByLabelText('Name')).toHaveValue('Courtyard Cafe')
  })

  it('disables the form while the request is in flight', async () => {
    captureBodies('post', '*/operator/api/venues', async () => {
      await delay('infinite')
      return HttpResponse.json({})
    })
    renderApp('/admin/venues/new')
    await userEvent.type(await screen.findByLabelText('Name'), 'Courtyard Cafe')
    await userEvent.click(screen.getByRole('button', { name: 'Create venue' }))
    expect(await screen.findByRole('button', { name: 'Creating venue…' })).toBeDisabled()
    expect(screen.getByLabelText('Name')).toBeDisabled()
  })

  it('a network failure shows the unreachable message', async () => {
    server.use(http.post('*/operator/api/venues', () => HttpResponse.error()))
    renderApp('/admin/venues/new')
    await userEvent.type(await screen.findByLabelText('Name'), 'Courtyard Cafe')
    await userEvent.click(screen.getByRole('button', { name: 'Create venue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE_MESSAGE)
  })
})

describe('editing a venue', () => {
  it('the view offers Edit, which opens the form filled from the venue; a save stays and says so', async () => {
    mockVenue(1, () => HttpResponse.json({ data: gatewayVenue(), success: true }))
    const bodies = captureBodies('patch', '*/operator/api/venues/1', (body) =>
      HttpResponse.json({ data: gatewayVenue({ ...body, amenities: body.amenities ?? [] }), success: true }),
    )
    const router = renderApp('/admin/venues/1')
    await userEvent.click(await screen.findByRole('link', { name: 'Edit venue' }))
    expect(path(router)).toBe('/admin/venues/1/edit')

    const name = await screen.findByLabelText('Name')
    expect(name).toHaveValue('Skyline Rooftop')
    expect(screen.getByLabelText('Latitude (optional)')).toHaveValue('19.059600')
    expect(screen.getByLabelText('Total capacity (optional)')).toHaveValue('120')
    expect(screen.getByLabelText('Active')).toBeChecked()
    expect(within(screen.getByRole('list', { name: 'Added amenities' })).getAllByRole('listitem')).toHaveLength(2)

    await userEvent.clear(name)
    await userEvent.type(name, 'Skyline Terrace')
    await userEvent.clear(screen.getByLabelText('Subtitle (optional)'))
    await userEvent.clear(screen.getByLabelText('Seating capacity (optional)'))
    await userEvent.click(screen.getByLabelText('Active'))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Venue saved.')).toHaveAttribute('role', 'status')
    expect(path(router)).toBe('/admin/venues/1/edit')
    expect(bodies[0]).toMatchObject({
      name: 'Skyline Terrace',
      subtitle: '',
      seating_capacity: null,
      total_capacity: 120,
      is_active: false,
      amenities: ['parking', 'dance_floor'],
    })

    await userEvent.type(name, '!')
    expect(screen.queryByText('Venue saved.')).not.toBeInTheDocument()
  })

  it('won’t send an emptied amenity list: the gateway can’t clear it yet', async () => {
    mockVenue(1, () => HttpResponse.json({ data: gatewayVenue({ amenities: ['parking'] }), success: true }))
    const bodies = captureBodies('patch', '*/operator/api/venues/1', () => HttpResponse.json({}))
    renderApp('/admin/venues/1/edit')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove parking' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      await screen.findByText('Keep at least one amenity: removing them all isn’t supported yet.'),
    ).toBeInTheDocument()
    expect(bodies).toHaveLength(0)
  })

  it('a missing venue says so instead of a form', async () => {
    mockVenue(99, () => envelope(404, "Couldn't find Venue with 'id'=99"))
    renderApp('/admin/venues/99/edit')
    expect(await screen.findByText(VENUE_NOT_FOUND_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to venues' })).toBeInTheDocument()
  })

  it('a failed save shows the server’s message and keeps the edits', async () => {
    mockVenue(1, () => HttpResponse.json({ data: gatewayVenue(), success: true }))
    captureBodies('patch', '*/operator/api/venues/1', () => envelope(403, 'You are not authorized'))
    renderApp('/admin/venues/1/edit')
    const name = await screen.findByLabelText('Name')
    await userEvent.type(name, '!')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You don’t have access to this.')
    expect(name).toHaveValue('Skyline Rooftop!')
  })
})

describe('deleting a venue', () => {
  it('asks to confirm first; Cancel sends nothing', async () => {
    mockVenue(1, () => HttpResponse.json({ data: gatewayVenue(), success: true }))
    let deletes = 0
    server.use(
      http.delete('*/operator/api/venues/1', () => {
        deletes += 1
        return HttpResponse.json({ data: gatewayVenue(), success: true })
      }),
    )
    renderApp('/admin/venues/1')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete venue' }))
    const confirm = screen.getByRole('group', { name: 'Confirm delete' })
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Confirm delete' })).not.toBeInTheDocument()
    expect(deletes).toBe(0)
  })

  it('once confirmed, deletes and goes back to a fresh list', async () => {
    let venues = [gatewayVenue(), gatewayVenue({ id: 2, name: 'Courtyard Cafe' })]
    mockList(() => venues)
    mockVenue(1, () => HttpResponse.json({ data: gatewayVenue(), success: true }))
    server.use(
      http.delete('*/operator/api/venues/1', () => {
        venues = venues.filter((v) => v.id !== 1)
        return HttpResponse.json({ data: gatewayVenue(), success: true })
      }),
    )
    const router = renderApp('/admin/venues/1')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete venue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete venue' }))
    expect(await screen.findByRole('link', { name: 'Courtyard Cafe' })).toBeInTheDocument()
    expect(path(router)).toBe('/admin/venues')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Skyline Rooftop' })).not.toBeInTheDocument())
  })

  it('a venue with events gets the friendlier message, keeps the server’s words, and stays open', async () => {
    mockVenue(1, () => HttpResponse.json({ data: gatewayVenue(), success: true }))
    server.use(http.delete('*/operator/api/venues/1', () => envelope(422, HAS_EVENTS_SERVER_MESSAGE)))
    const router = renderApp('/admin/venues/1')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete venue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete venue' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(HAS_EVENTS_MESSAGE)
    expect(alert).toHaveTextContent(`The server said: ${HAS_EVENTS_SERVER_MESSAGE}`)
    expect(path(router)).toBe('/admin/venues/1')
    expect(screen.getByRole('heading', { level: 1, name: 'Skyline Rooftop' })).toBeInTheDocument()
  })

  it('a venue that’s already gone says so', async () => {
    mockVenue(1, () => HttpResponse.json({ data: gatewayVenue(), success: true }))
    server.use(http.delete('*/operator/api/venues/1', () => envelope(404, "Couldn't find Venue with 'id'=1")))
    renderApp('/admin/venues/1')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete venue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete venue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(VENUE_NOT_FOUND_MESSAGE)
  })
})
