import { z } from 'zod'
import { required } from '@/features/auth/form-rules'
import type { VenueInput, VenueRecord } from './api'

// Browser checks for the venue form. The operator itself only requires a name; latitude and longitude are held to
// their ranges by database check constraints, which would surface as a server error rather than a message, so the
// form checks them first. Capacities are integer columns.

const DECIMAL = /^-?\d+(\.\d+)?$/
const WHOLE = /^\d+$/
// Loose on purpose: the operator doesn't check the format, this only catches a missing @ or domain.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const WHOLE_MESSAGE = 'Enter a whole number of 0 or more'

const inRange = (min: number, max: number) => (value: string) =>
  value === '' || (DECIMAL.test(value) && Number(value) >= min && Number(value) <= max)

const optionalWhole = z.string().trim().refine((value) => value === '' || WHOLE.test(value), WHOLE_MESSAGE)

export const venueFormSchema = z.object({
  name: required('Enter a name'),
  subtitle: z.string(),
  description: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string(),
  latitude: z.string().trim().refine(inRange(-90, 90), 'Enter a latitude between -90 and 90'),
  longitude: z.string().trim().refine(inRange(-180, 180), 'Enter a longitude between -180 and 180'),
  totalCapacity: optionalWhole,
  seatingCapacity: optionalWhole,
  pocName: z.string(),
  pocMobile: z.string(),
  pocEmail: z
    .string()
    .trim()
    .refine((value) => value === '' || EMAIL.test(value), 'Enter an email address like name@example.com'),
  website: z.string(),
  zomatoUrl: z.string(),
  imageUrl: z.string(),
  amenities: z.array(z.string()),
  isActive: z.boolean(),
})

export type VenueFormFields = z.infer<typeof venueFormSchema>

export const EMPTY_VENUE_FIELDS: VenueFormFields = {
  name: '',
  subtitle: '',
  description: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  latitude: '',
  longitude: '',
  totalCapacity: '',
  seatingCapacity: '',
  pocName: '',
  pocMobile: '',
  pocEmail: '',
  website: '',
  zomatoUrl: '',
  imageUrl: '',
  amenities: [],
  // The operator's column default: a new venue is open for events.
  isActive: true,
}

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value))

export function toVenueInput(fields: VenueFormFields): VenueInput {
  return {
    name: fields.name.trim(),
    subtitle: fields.subtitle.trim(),
    description: fields.description.trim(),
    addressLine1: fields.addressLine1.trim(),
    addressLine2: fields.addressLine2.trim(),
    city: fields.city.trim(),
    state: fields.state.trim(),
    postalCode: fields.postalCode.trim(),
    country: fields.country.trim(),
    latitude: numberOrNull(fields.latitude),
    longitude: numberOrNull(fields.longitude),
    totalCapacity: numberOrNull(fields.totalCapacity),
    seatingCapacity: numberOrNull(fields.seatingCapacity),
    pocName: fields.pocName.trim(),
    pocMobile: fields.pocMobile.trim(),
    pocEmail: fields.pocEmail.trim(),
    website: fields.website.trim(),
    zomatoUrl: fields.zomatoUrl.trim(),
    imageUrl: fields.imageUrl.trim(),
    amenities: fields.amenities,
    isActive: fields.isActive,
  }
}

const textOf = (value: number | string | null) => (value === null ? '' : String(value))

export function toFormFields(venue: VenueRecord): VenueFormFields {
  return {
    name: venue.name,
    subtitle: venue.subtitle,
    description: venue.description,
    addressLine1: venue.addressLine1,
    addressLine2: venue.addressLine2,
    city: venue.city,
    state: venue.state,
    postalCode: venue.postalCode,
    country: venue.country,
    latitude: textOf(venue.latitude),
    longitude: textOf(venue.longitude),
    totalCapacity: textOf(venue.totalCapacity),
    seatingCapacity: textOf(venue.seatingCapacity),
    pocName: venue.pocName,
    pocMobile: venue.pocMobile,
    pocEmail: venue.pocEmail,
    website: venue.website,
    zomatoUrl: venue.zomatoUrl,
    imageUrl: venue.imageUrl,
    amenities: venue.amenities,
    isActive: venue.isActive,
  }
}
