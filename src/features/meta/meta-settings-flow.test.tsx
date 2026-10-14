import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { UNREACHABLE_MESSAGE } from '@/features/auth/session-actions'
import { loadSession, startSession } from '@/lib/session/session'
import { makeJwt } from '@/test/jwt'
import { server } from '@/test/msw'
import { renderApp } from '@/test/render'
import { CONNECT_FIRST_MESSAGE, META_UNREACHABLE_MESSAGE, NOT_CONNECTED_SERVER_MESSAGE } from './meta-settings'

const envelope = (status: number, message: string) =>
  HttpResponse.json({ error: { message, status }, success: false }, { status })

const page = (overrides: Partial<{ id: number; label: string; page_id: string; ad_account_id: string | null }> = {}) => ({
  id: 1,
  label: 'Main page',
  page_id: '12345',
  ad_account_id: 'act_1',
  ...overrides,
})

function mockConnection(respond: () => Response | Promise<Response>) {
  server.use(http.get('*/operator/api/meta_connection', () => respond()))
}
function mockConnect(respond: () => Response | Promise<Response>) {
  const bodies: unknown[] = []
  server.use(
    http.post('*/operator/api/meta_connection', async ({ request }) => {
      bodies.push(await request.json().catch(() => null))
      return respond()
    }),
  )
  return bodies
}
function mockPages(respond: () => Response | Promise<Response>) {
  server.use(http.get('*/operator/api/meta_credentials', () => respond()))
}
function mockCreatePage(respond: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const bodies: Record<string, unknown>[] = []
  server.use(
    http.post('*/operator/api/meta_credentials', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      bodies.push(body)
      return respond(body)
    }),
  )
  return bodies
}
function mockUpdatePage(respond: (body: Record<string, unknown>, id: string) => Response | Promise<Response>) {
  const bodies: { id: string; body: Record<string, unknown> }[] = []
  server.use(
    http.patch('*/operator/api/meta_credentials/:id', async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      bodies.push({ id: String(params.id), body })
      return respond(body, String(params.id))
    }),
  )
  return bodies
}

const path = (router: ReturnType<typeof renderApp>) => router.state.location.pathname

describe('finding the Meta settings page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
    mockConnection(() => HttpResponse.json({ data: { connected: false }, success: true }))
  })

  it('is reached from the sidebar Settings → Meta link', async () => {
    const router = renderApp('/t')
    await userEvent.click(
      within(await screen.findByRole('navigation', { name: 'Settings' })).getByRole('link', { name: 'Meta' }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Meta' })).toBeInTheDocument()
    expect(path(router)).toBe('/t/settings/meta')
  })

  it('a non-admin can’t open it: the tenant guard sends them away', async () => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt({ role_name: 'event_manager' }))
    const router = renderApp('/t/settings/meta')
    await waitFor(() => expect(path(router)).not.toBe('/t/settings/meta'))
  })
})

describe('connecting the organisation to Meta', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
  })

  it('shows a labelled skeleton while the connection query is pending (AGENTS.md §4)', async () => {
    mockConnection(async () => {
      await delay('infinite')
      return HttpResponse.json({ data: { connected: false }, success: true })
    })
    renderApp('/t/settings/meta')
    expect(await screen.findByRole('status', { name: 'Checking Meta connection' })).toBeInTheDocument()
  })

  it('shows the Connect button when the organisation isn’t connected yet, and provisions on click', async () => {
    // The connection query flips to "connected" after the POST invalidates it, so the mock has to answer the
    // refetch with the new state (same as the real server would).
    let connected = false
    server.use(
      http.get('*/operator/api/meta_connection', () =>
        HttpResponse.json({
          data: connected ? { connected: true, connected_at: '2026-05-01T10:00:00.000Z' } : { connected: false },
          success: true,
        }),
      ),
    )
    const bodies = mockConnect(() => {
      connected = true
      return HttpResponse.json({ data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' }, success: true })
    })
    mockPages(() => HttpResponse.json({ data: [], success: true }))
    renderApp('/t/settings/meta')

    const button = await screen.findByRole('button', { name: 'Connect to Meta' })
    await userEvent.click(button)

    expect(await screen.findByRole('status', { name: 'Connected to Meta' })).toBeInTheDocument()
    expect(bodies).toHaveLength(1)
  })

  it('shows Meta’s unreachable copy when the Meta service is failing', async () => {
    mockConnection(() => HttpResponse.json({ data: { connected: false }, success: true }))
    mockConnect(() => envelope(502, 'Meta service is temporarily unavailable'))
    renderApp('/t/settings/meta')
    await userEvent.click(await screen.findByRole('button', { name: 'Connect to Meta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(META_UNREACHABLE_MESSAGE)
  })

  it('says when the server is unreachable (gateway outage)', async () => {
    mockConnection(() => HttpResponse.json({ data: { connected: false }, success: true }))
    mockConnect(() => HttpResponse.error())
    renderApp('/t/settings/meta')
    await userEvent.click(await screen.findByRole('button', { name: 'Connect to Meta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE_MESSAGE)
  })

  it('shows the connected card when the organisation is already connected', async () => {
    mockConnection(() =>
      HttpResponse.json({ data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' }, success: true }),
    )
    mockPages(() => HttpResponse.json({ data: [], success: true }))
    renderApp('/t/settings/meta')
    expect(await screen.findByRole('status', { name: 'Connected to Meta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect to Meta' })).not.toBeInTheDocument()
  })

  it('offers a Try again button when the connection query fails, and recovers on retry', async () => {
    let callCount = 0
    server.use(
      http.get('*/operator/api/meta_connection', () => {
        callCount += 1
        if (callCount === 1) return envelope(502, 'Meta is unreachable')
        return HttpResponse.json({ data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' }, success: true })
      }),
    )
    mockPages(() => HttpResponse.json({ data: [], success: true }))
    renderApp('/t/settings/meta')

    expect(await screen.findByRole('alert')).toHaveTextContent(META_UNREACHABLE_MESSAGE)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('status', { name: 'Connected to Meta' })).toBeInTheDocument()
  })
})

describe('listing Facebook pages', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
    mockConnection(() =>
      HttpResponse.json({ data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' }, success: true }),
    )
  })

  it('shows the connected pages with label, page id and ad account', async () => {
    mockPages(() =>
      HttpResponse.json({
        data: [page(), page({ id: 2, label: 'Second page', page_id: '98765', ad_account_id: null })],
        success: true,
      }),
    )
    renderApp('/t/settings/meta')
    expect(await screen.findByText('Main page')).toBeInTheDocument()
    expect(screen.getByText('Facebook page 12345')).toBeInTheDocument()
    expect(screen.getByText('Ad account act_1')).toBeInTheDocument()
    expect(screen.getByText('Second page')).toBeInTheDocument()
    expect(screen.getByText('No ad account: ads won’t be available for this page.')).toBeInTheDocument()
  })

  it('shows the empty state when the connection exists but no pages have been added', async () => {
    mockPages(() => HttpResponse.json({ data: [], success: true }))
    renderApp('/t/settings/meta')
    expect(await screen.findByText('Add your first page below.')).toBeInTheDocument()
  })

  it('shows "Connect to Meta first" when the server reports no connection, with a Connect button', async () => {
    // Could happen if the connection was revoked between the connection check and the pages list — the UI should
    // recover by offering the connect flow again.
    mockConnection(() =>
      HttpResponse.json({ data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' }, success: true }),
    )
    mockPages(() => envelope(422, NOT_CONNECTED_SERVER_MESSAGE))
    renderApp('/t/settings/meta')
    expect(await screen.findByText(CONNECT_FIRST_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect to Meta' })).toBeInTheDocument()
  })
})

describe('adding a Facebook page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
    mockConnection(() =>
      HttpResponse.json({ data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' }, success: true }),
    )
  })

  async function fillAdd({
    label = 'Main page',
    pageId = '12345',
    token = 'tok_secret',
    adAccount = '',
  }: { label?: string; pageId?: string; token?: string; adAccount?: string } = {}) {
    const region = within(await screen.findByRole('region', { name: 'Add a Facebook page' }))
    if (label) await userEvent.type(nameInput(), label)
    if (pageId) await userEvent.type(pageIdInput(), pageId)
    if (token) await userEvent.type(tokenInput(), token)
    if (adAccount) await userEvent.type(adAccountInput(), adAccount)
    await userEvent.click(region.getByRole('button', { name: 'Add page' }))
    return region
  }
  // Password-type inputs have no implicit ARIA role, and jsdom's accessible-name computation isn't picking up
  // `<label for="...">` for inputs that also carry aria-describedby in this setup; looking up by id is reliable
  // and matches what the real user interacts with.
  const nameInput = () => document.getElementById('meta-add-label') as HTMLInputElement
  const pageIdInput = () => document.getElementById('meta-add-page-id') as HTMLInputElement
  const adAccountInput = () => document.getElementById('meta-add-ad-account') as HTMLInputElement
  const tokenInput = () => document.getElementById('meta-add-token') as HTMLInputElement

  it('posts the typed fields in the server’s names and refreshes the list', async () => {
    let callCount = 0
    server.use(
      http.get('*/operator/api/meta_credentials', () => {
        callCount += 1
        if (callCount === 1) return HttpResponse.json({ data: [], success: true })
        return HttpResponse.json({ data: [page({ label: 'Main page' })], success: true })
      }),
    )
    const posted = mockCreatePage(() => HttpResponse.json({ data: page({ label: 'Main page' }), success: true }))

    renderApp('/t/settings/meta')
    await fillAdd({ adAccount: 'act_42' })

    expect(await screen.findByText('Added Main page.')).toBeInTheDocument()
    expect(posted).toEqual([
      { label: 'Main page', page_id: '12345', page_access_token: 'tok_secret', ad_account_id: 'act_42' },
    ])
    expect(await screen.findByText('Facebook page 12345')).toBeInTheDocument()
  })

  it('clears the token field (and the rest) after a successful add', async () => {
    mockPages(() => HttpResponse.json({ data: [], success: true }))
    mockCreatePage(() => HttpResponse.json({ data: page(), success: true }))
    renderApp('/t/settings/meta')
    await fillAdd()
    await screen.findByText('Added Main page.')

    expect(nameInput()).toHaveValue('')
    expect(pageIdInput()).toHaveValue('')
    expect(tokenInput()).toHaveValue('')
  })

  it('shows the server’s message when Meta rejects the token, keeping the form', async () => {
    mockPages(() => HttpResponse.json({ data: [], success: true }))
    mockCreatePage(() => envelope(422, 'Meta rejected this access token as invalid or expired'))
    renderApp('/t/settings/meta')
    await fillAdd()
    expect(await screen.findByRole('alert')).toHaveTextContent('Meta rejected this access token as invalid or expired')
    // The form stays so the admin can paste a new token.
    expect(tokenInput()).toBeInTheDocument()
  })

  it('checks the required fields before sending anything', async () => {
    mockPages(() => HttpResponse.json({ data: [], success: true }))
    const posted = mockCreatePage(() => HttpResponse.json({ data: page(), success: true }))
    renderApp('/t/settings/meta')
    const region = within(await screen.findByRole('region', { name: 'Add a Facebook page' }))
    await userEvent.click(region.getByRole('button', { name: 'Add page' }))
    expect(await region.findByText('Enter a name for this page')).toBeInTheDocument()
    expect(region.getByText('Enter the Facebook page id')).toBeInTheDocument()
    expect(region.getByText('Enter the page access token')).toBeInTheDocument()
    expect(posted).toEqual([])
  })

  it('disables the form while the add is in flight', async () => {
    mockPages(() => HttpResponse.json({ data: [], success: true }))
    mockCreatePage(async () => {
      await delay('infinite')
      return HttpResponse.json({ data: page(), success: true })
    })
    renderApp('/t/settings/meta')
    await fillAdd()
    const region = within(await screen.findByRole('region', { name: 'Add a Facebook page' }))
    expect(region.getByRole('button', { name: 'Adding page…' })).toBeDisabled()
    expect(nameInput()).toBeDisabled()
    expect(tokenInput()).toBeDisabled()
  })
})

describe('editing a Facebook page', () => {
  // Known ids on the edit form for id=1 (see meta-settings-page.tsx). Scoped lookups keep the Add card and the
  // Edit form from colliding on their shared label text ("Name", etc.).
  const editName = () => document.getElementById('meta-edit-1-label') as HTMLInputElement
  const editToken = () => document.getElementById('meta-edit-1-token') as HTMLInputElement

  beforeEach(() => {
    sessionStorage.clear()
    loadSession()
    startSession(makeJwt())
    mockConnection(() =>
      HttpResponse.json({ data: { connected: true, connected_at: '2026-05-01T10:00:00.000Z' }, success: true }),
    )
    mockPages(() => HttpResponse.json({ data: [page()], success: true }))
  })

  it('starts with an empty token field — never pre-filled from the server', async () => {
    renderApp('/t/settings/meta')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(editToken()).not.toBeNull())
    expect(editToken()).toHaveValue('')
  })

  it('omits the token on save when the field is left empty', async () => {
    const posted = mockUpdatePage(() => HttpResponse.json({ data: page({ label: 'Renamed' }), success: true }))
    renderApp('/t/settings/meta')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(editName()).not.toBeNull())
    await userEvent.clear(editName())
    await userEvent.type(editName(), 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual({ id: '1', body: { label: 'Renamed', ad_account_id: 'act_1' } })
  })

  it('sends the typed replacement token when the admin pastes one', async () => {
    const posted = mockUpdatePage(() => HttpResponse.json({ data: page(), success: true }))
    renderApp('/t/settings/meta')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(editToken()).not.toBeNull())
    await userEvent.type(editToken(), 'tok_new')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0].body).toEqual({ label: 'Main page', ad_account_id: 'act_1', page_access_token: 'tok_new' })
  })

  it('closes the edit form on success, so the token field stops existing in the DOM', async () => {
    mockUpdatePage(() => HttpResponse.json({ data: page({ label: 'Renamed' }), success: true }))
    renderApp('/t/settings/meta')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(editToken()).not.toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(editToken()).toBeNull())
  })

  it("shows the server's message when Meta rejects the new token", async () => {
    mockUpdatePage(() => envelope(422, 'Meta rejected this access token as invalid or expired'))
    renderApp('/t/settings/meta')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(editToken()).not.toBeNull())
    await userEvent.type(editToken(), 'tok_bad')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Meta rejected this access token as invalid or expired')
    // Form stays so the admin can try again or cancel.
    expect(editToken()).toBeInTheDocument()
  })

  it('cancels back to the row without saving', async () => {
    renderApp('/t/settings/meta')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(editToken()).not.toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(editToken()).toBeNull())
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})
