import { REQUEST_TIMEOUT_MS, requestWithSession } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import type { components } from '@/lib/api/schema'

// Venues (OW-15) go through requestWithSession, as events do: the gateway's OpenAPI declares no request body for
// the venue writes and names the pagination keys currentPage/totalPages/totalRecords, while the operator sends
// current_page/total_pages/total_count. Field names are still checked against the generated Venue schema, so a
// rename in the gateway fails the typecheck.
type GatewayVenue = components['schemas']['Venue']

const VENUE_KEYS = {
  id: 'id',
  name: 'name',
  subtitle: 'subtitle',
  description: 'description',
  addressLine1: 'address_line1',
  addressLine2: 'address_line2',
  city: 'city',
  state: 'state',
  postalCode: 'postal_code',
  country: 'country',
  latitude: 'latitude',
  longitude: 'longitude',
  totalCapacity: 'total_capacity',
  seatingCapacity: 'seating_capacity',
  pocName: 'poc_name',
  pocMobile: 'poc_mobile',
  pocEmail: 'poc_email',
  website: 'website',
  zomatoUrl: 'zomato_url',
  imageUrl: 'image_url',
  amenities: 'amenities',
  isActive: 'is_active',
} as const satisfies Record<string, keyof GatewayVenue>

type Keys = typeof VENUE_KEYS
type TextField = Exclude<keyof Keys, 'id' | NumberField | 'amenities' | 'isActive'>
type NumberField = 'latitude' | 'longitude' | 'totalCapacity' | 'seatingCapacity'

// The text fields in the order the operator permits them. Each is sent as the admin typed it (trimmed).
const TEXT_FIELDS = [
  'name',
  'subtitle',
  'description',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'pocName',
  'pocMobile',
  'pocEmail',
  'website',
  'zomatoUrl',
  'imageUrl',
] as const satisfies readonly TextField[]

const NUMBER_FIELDS = ['latitude', 'longitude', 'totalCapacity', 'seatingCapacity'] as const satisfies readonly NumberField[]

// The ticket's page size. The operator defaults to 10, so it is always sent.
export const VENUES_PER_PAGE = 25

export interface VenueRecord {
  id: number
  name: string
  subtitle: string
  description: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  // Decimals as the server wrote them ("19.059600"), or null when unset.
  latitude: string | null
  longitude: string | null
  totalCapacity: number | null
  seatingCapacity: number | null
  pocName: string
  pocMobile: string
  pocEmail: string
  website: string
  zomatoUrl: string
  imageUrl: string
  amenities: string[]
  isActive: boolean
}

export interface VenuePage {
  venues: VenueRecord[]
  currentPage: number
  // Null when the server sent no pagination keys, which it does for a page past the end.
  totalPages: number | null
  totalCount: number | null
}

// What the venue form submits: text trimmed ('' when empty), numbers or null when empty.
export type VenueInput = Omit<VenueRecord, 'id' | 'latitude' | 'longitude'> & {
  latitude: number | null
  longitude: number | null
}

const UNEXPECTED = () => new ApiError(200, 'The server sent an unexpected response')

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const integer = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) ? value : null)
const decimal = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : typeof value === 'number' ? String(value) : null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readVenue(data: Record<string, unknown>): VenueRecord {
  const id = integer(data[VENUE_KEYS.id])
  if (id === null) throw UNEXPECTED()
  const amenities = data[VENUE_KEYS.amenities]
  return {
    id,
    name: text(data[VENUE_KEYS.name]),
    subtitle: text(data[VENUE_KEYS.subtitle]),
    description: text(data[VENUE_KEYS.description]),
    addressLine1: text(data[VENUE_KEYS.addressLine1]),
    addressLine2: text(data[VENUE_KEYS.addressLine2]),
    city: text(data[VENUE_KEYS.city]),
    state: text(data[VENUE_KEYS.state]),
    postalCode: text(data[VENUE_KEYS.postalCode]),
    country: text(data[VENUE_KEYS.country]),
    latitude: decimal(data[VENUE_KEYS.latitude]),
    longitude: decimal(data[VENUE_KEYS.longitude]),
    totalCapacity: integer(data[VENUE_KEYS.totalCapacity]),
    seatingCapacity: integer(data[VENUE_KEYS.seatingCapacity]),
    pocName: text(data[VENUE_KEYS.pocName]),
    pocMobile: text(data[VENUE_KEYS.pocMobile]),
    pocEmail: text(data[VENUE_KEYS.pocEmail]),
    website: text(data[VENUE_KEYS.website]),
    zomatoUrl: text(data[VENUE_KEYS.zomatoUrl]),
    imageUrl: text(data[VENUE_KEYS.imageUrl]),
    // A cleared list sent through the gateway is stored as [""] (see updateBody), so blanks are dropped on read.
    amenities: Array.isArray(amenities)
      ? amenities.filter((a): a is string => typeof a === 'string' && a.trim() !== '')
      : [],
    // The column defaults to true and is never null.
    isActive: data[VENUE_KEYS.isActive] !== false,
  }
}

function envelopeData(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !isRecord(body.data)) throw UNEXPECTED()
  return body.data
}

const venuePath = (id: number) => `/operator/api/venues/${encodeURIComponent(String(id))}`

// GET /operator/api/venues: every venue, a page at a time. Venues are shared across tenants, so a tenant admin
// and a super admin see the same list.
export async function fetchVenuePage(page: number): Promise<VenuePage> {
  const query = new URLSearchParams({ page: String(page), per_page: String(VENUES_PER_PAGE) })
  const body = await requestWithSession('GET', `/operator/api/venues?${query}`, null)
  if (!isRecord(body) || !Array.isArray(body.data)) throw UNEXPECTED()
  return {
    venues: body.data.filter(isRecord).map(readVenue),
    currentPage: integer(body.current_page) ?? page,
    totalPages: integer(body.total_pages),
    totalCount: integer(body.total_count),
  }
}

// GET /operator/api/venues/{id}: 404 when it doesn't exist.
export async function fetchVenue(id: number): Promise<VenueRecord> {
  return readVenue(envelopeData(await requestWithSession('GET', venuePath(id), null)))
}

type Body = Partial<Record<Keys[keyof Keys], unknown>>

// The gateway forwards bodies to the operator form-encoded. That turns an empty array into `amenities[]=`, which
// Rails stores as [""], so an empty amenity list is never sent; and null into `latitude=`, which Rails saves as nil.

// A create leaves out whatever the admin left empty, so the operator's column defaults apply.
function createBody(input: VenueInput): Body {
  const body: Body = { [VENUE_KEYS.isActive]: input.isActive }
  for (const field of TEXT_FIELDS) if (input[field]) body[VENUE_KEYS[field]] = input[field]
  for (const field of NUMBER_FIELDS) if (input[field] !== null) body[VENUE_KEYS[field]] = input[field]
  if (input.amenities.length > 0) body[VENUE_KEYS.amenities] = input.amenities
  return body
}

// An update sends every field, so emptying one clears it: '' for text, null for numbers (left out, the operator
// would keep the old value).
function updateBody(input: VenueInput): Body {
  const body: Body = {}
  for (const field of TEXT_FIELDS) body[VENUE_KEYS[field]] = input[field]
  for (const field of NUMBER_FIELDS) body[VENUE_KEYS[field]] = input[field]
  if (input.amenities.length > 0) body[VENUE_KEYS.amenities] = input.amenities
  body[VENUE_KEYS.isActive] = input.isActive
  return body
}

// POST /operator/api/venues. Super admin only (the operator answers 403 to anyone else). Validation failures are one
// joined 422.
export async function requestCreateVenue(input: VenueInput, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<VenueRecord> {
  return readVenue(envelopeData(await requestWithSession('POST', '/operator/api/venues', createBody(input), timeoutMs)))
}

// PATCH /operator/api/venues/{id}. Super admin only.
export async function requestUpdateVenue(id: number, input: VenueInput): Promise<VenueRecord> {
  return readVenue(envelopeData(await requestWithSession('PATCH', venuePath(id), updateBody(input))))
}

// DELETE /operator/api/venues/{id}. Super admin only. A venue that events still point at is refused with 422
// "Cannot delete record because dependent events exist" (has_many :events, dependent: :restrict_with_error).
export async function requestDeleteVenue(id: number): Promise<void> {
  await requestWithSession('DELETE', venuePath(id), null)
}
