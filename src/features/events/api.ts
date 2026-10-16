import { REQUEST_TIMEOUT_MS, requestWithSession } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import type { components, paths } from '@/lib/api/schema'

// Events (OW-14) go through requestWithSession rather than the typed client: the gateway's OpenAPI declares neither
// the list filters (search, venue_id, page, per_page) nor the pagination keys the operator really sends (it names
// them currentPage/totalPages/totalRecords; the operator sends current_page/total_pages/total_count at the top
// level). Field names are still checked against the generated schema: the keys below are typed from it, so a
// rename in the gateway fails the typecheck.
type GatewayEvent = components['schemas']['Event']
type GatewayCreateBody = NonNullable<
  paths['/operator/api/events']['post']['requestBody']
>['content']['application/json']
type GatewayUpdateBody = NonNullable<
  paths['/operator/api/events/{id}']['patch']['requestBody']
>['content']['application/json']

// Numbers the admin may leave empty. The gateway's OpenAPI types them as optional numbers; a create leaves an
// empty one out, but an update has to send null to clear it (left out, the operator keeps the old value). The
// gateway forwards null form-encoded as `base_price=`, which Rails saves as nil.
type Clearable = 'base_price' | 'max_tickets' | 'max_male_tickets' | 'max_female_tickets'
type UpdateBody = Omit<GatewayUpdateBody, Clearable | 'tenant_id'> & { [K in Clearable]: number | null }
type GatewayVenue = components['schemas']['Venue']

const EVENT_KEYS = {
  id: 'id',
  title: 'title',
  description: 'description',
  startTime: 'start_time',
  endTime: 'end_time',
  venueId: 'venue_id',
  area: 'area',
  imageUrlVertical: 'image_url_vertical',
  imageUrlHorizontal: 'image_url_horizontal',
  basePrice: 'base_price',
  coverPrice: 'cover_price',
  maxTickets: 'max_tickets',
  maxMaleTickets: 'max_male_tickets',
  maxFemaleTickets: 'max_female_tickets',
  features: 'features',
  tenantId: 'tenant_id',
} as const satisfies Record<string, keyof GatewayEvent>

const VENUE_NAME: keyof GatewayVenue = 'name'

// The ticket's page size. The operator defaults to 10, so it is always sent.
export const EVENTS_PER_PAGE = 25

export interface EventRecord {
  id: number
  title: string
  description: string
  // Milliseconds since the epoch, or null when the server doesn't say. The gateway sends Unix seconds.
  startTime: number | null
  endTime: number | null
  venueId: number | null
  area: string
  imageUrlVertical: string
  imageUrlHorizontal: string
  // Decimals as the server wrote them ("1500.0"), or null when unset.
  basePrice: string | null
  coverPrice: string | null
  maxTickets: number | null
  maxMaleTickets: number | null
  maxFemaleTickets: number | null
  features: string[]
  // The owning tenant (GAT-11). Only a super admin's screens show it.
  tenantId: number | null
}

export interface EventPage {
  events: EventRecord[]
  currentPage: number
  // Null when the server sent no pagination keys, which it does for a page past the end.
  totalPages: number | null
  totalCount: number | null
}

export interface EventListParams {
  page?: number
  search?: string
  venueId?: number
  // Super admin only: the operator ignores it for anyone else.
  tenantId?: number
}

export interface Venue {
  id: number
  name: string
}

// What the event form submits. `tenantId` is only ever set by the super admin's create form.
export interface EventInput {
  title: string
  description: string
  startTime: number
  endTime: number
  venueId: number
  area: string
  imageUrlVertical: string
  imageUrlHorizontal: string
  basePrice: number | null
  coverPrice: number
  maxTickets: number | null
  maxMaleTickets: number | null
  maxFemaleTickets: number | null
  features: string[]
  tenantId?: number
}

const UNEXPECTED = () => new ApiError(200, 'The server sent an unexpected response')

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const integer = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : null)
const decimal = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : typeof value === 'number' ? String(value) : null
const seconds = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value * 1000 : null)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readEvent(data: Record<string, unknown>): EventRecord {
  const id = integer(data[EVENT_KEYS.id])
  if (id === null) throw UNEXPECTED()
  const features = data[EVENT_KEYS.features]
  return {
    id,
    title: text(data[EVENT_KEYS.title]),
    description: text(data[EVENT_KEYS.description]),
    startTime: seconds(data[EVENT_KEYS.startTime]),
    endTime: seconds(data[EVENT_KEYS.endTime]),
    venueId: integer(data[EVENT_KEYS.venueId]),
    area: text(data[EVENT_KEYS.area]),
    imageUrlVertical: text(data[EVENT_KEYS.imageUrlVertical]),
    imageUrlHorizontal: text(data[EVENT_KEYS.imageUrlHorizontal]),
    basePrice: decimal(data[EVENT_KEYS.basePrice]),
    coverPrice: decimal(data[EVENT_KEYS.coverPrice]),
    maxTickets: integer(data[EVENT_KEYS.maxTickets]),
    maxMaleTickets: integer(data[EVENT_KEYS.maxMaleTickets]),
    maxFemaleTickets: integer(data[EVENT_KEYS.maxFemaleTickets]),
    // A cleared list sent through the gateway is stored as [""] (see sharedFields), so blanks are dropped on read.
    features: Array.isArray(features) ? features.filter((f): f is string => typeof f === 'string' && f.trim() !== '') : [],
    tenantId: integer(data[EVENT_KEYS.tenantId]),
  }
}

function envelopeData(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !isRecord(body.data)) throw UNEXPECTED()
  return body.data
}

function envelopeList(body: unknown): { list: unknown[]; envelope: Record<string, unknown> } {
  if (!isRecord(body) || !Array.isArray(body.data)) throw UNEXPECTED()
  return { list: body.data, envelope: body }
}

const eventPath = (id: number) => `/operator/api/events/${encodeURIComponent(String(id))}`

// GET /operator/api/events: the caller's events, newest first (a tenant admin's own; a super admin's across every
// tenant unless tenant_id narrows it). Blank filters are left out: the operator matches nothing for an empty
// venue_id or tenant_id.
export async function fetchEvents(params: EventListParams): Promise<EventPage> {
  const page = params.page ?? 1
  const query = new URLSearchParams({ page: String(page), per_page: String(EVENTS_PER_PAGE) })
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.venueId !== undefined) query.set('venue_id', String(params.venueId))
  if (params.tenantId !== undefined) query.set('tenant_id', String(params.tenantId))
  const { list, envelope } = envelopeList(await requestWithSession('GET', `/operator/api/events?${query}`, null))
  return {
    events: list.filter(isRecord).map(readEvent),
    currentPage: integer(envelope.current_page) ?? page,
    totalPages: integer(envelope.total_pages),
    totalCount: integer(envelope.total_count),
  }
}

// GET /operator/api/events/{id}: 404 when it doesn't exist or belongs to another tenant.
export async function fetchEvent(id: number): Promise<EventRecord> {
  return readEvent(envelopeData(await requestWithSession('GET', eventPath(id), null)))
}

// GET /operator/api/venues?page=0: every venue (page=0 turns the operator's pagination off). Venues aren't
// tenant-scoped; any admin can read them all.
export async function fetchVenues(): Promise<Venue[]> {
  const { list } = envelopeList(await requestWithSession('GET', '/operator/api/venues?page=0', null))
  return list
    .filter(isRecord)
    .map((venue) => ({ id: integer(venue.id), name: text(venue[VENUE_NAME]) }))
    .filter((venue): venue is Venue => venue.id !== null)
}

// The fields every request body has. The gateway forwards bodies to the operator form-encoded, which turns an
// empty array into `features[]=` and Rails into [""], so an empty feature list is left out rather than sent.
function sharedFields(input: EventInput) {
  return {
    title: input.title,
    description: input.description,
    start_time: new Date(input.startTime).toISOString(),
    end_time: new Date(input.endTime).toISOString(),
    venue_id: input.venueId,
    area: input.area,
    image_url_vertical: input.imageUrlVertical,
    image_url_horizontal: input.imageUrlHorizontal,
    cover_price: input.coverPrice,
    ...(input.features.length > 0 && { features: input.features }),
  } satisfies Partial<GatewayCreateBody> & Partial<GatewayUpdateBody>
}

// Unset numbers and the tenant are undefined here, which JSON.stringify leaves out of the request.
function createBody(input: EventInput): GatewayCreateBody {
  return {
    ...sharedFields(input),
    base_price: input.basePrice ?? undefined,
    max_tickets: input.maxTickets ?? undefined,
    max_male_tickets: input.maxMaleTickets ?? undefined,
    max_female_tickets: input.maxFemaleTickets ?? undefined,
    tenant_id: input.tenantId,
  }
}

function updateBody(input: EventInput): UpdateBody {
  return {
    ...sharedFields(input),
    base_price: input.basePrice,
    max_tickets: input.maxTickets,
    max_male_tickets: input.maxMaleTickets,
    max_female_tickets: input.maxFemaleTickets,
  }
}

// POST /operator/api/events. A tenant admin's event goes to their own tenant (the operator reads it from the JWT);
// a super admin must send tenant_id, or gets 422 "Tenant required". Validation failures are one joined 422.
export async function requestCreateEvent(input: EventInput, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<EventRecord> {
  const body = await requestWithSession('POST', '/operator/api/events', createBody(input), timeoutMs)
  return readEvent(envelopeData(body))
}

// PATCH /operator/api/events/{id}. tenant_id is never sent: the operator refuses to change it (422 "Tenant id
// cannot be changed"), and the edit screen only shows it.
export async function requestUpdateEvent(id: number, input: EventInput): Promise<EventRecord> {
  const body = await requestWithSession('PATCH', eventPath(id), updateBody(input))
  return readEvent(envelopeData(body))
}

// DELETE /operator/api/events/{id}. The operator answers 200 with the deleted event; 422 when leads or lead forms
// still point at it.
export async function requestDeleteEvent(id: number): Promise<void> {
  await requestWithSession('DELETE', eventPath(id), null)
}
