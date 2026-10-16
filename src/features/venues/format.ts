import type { VenueRecord } from './api'

// How the venue screens put several fields into one line. '—' stands for "nothing set".

const joined = (parts: string[], separator: string) => parts.filter((part) => part.trim() !== '').join(separator) || '—'

// "Mumbai, Maharashtra": the list's City / state column.
export const formatPlace = (venue: VenueRecord) => joined([venue.city, venue.state], ', ')

// "80 seated · 120 total". Either part is left out when the venue has no value for it.
export function formatCapacity(venue: VenueRecord): string {
  return joined(
    [
      venue.seatingCapacity === null ? '' : `${venue.seatingCapacity} seated`,
      venue.totalCapacity === null ? '' : `${venue.totalCapacity} total`,
    ],
    ' · ',
  )
}

// "14 Hill Road, Mumbai, Maharashtra 400050, India"
export const formatAddress = (venue: VenueRecord) =>
  joined(
    [venue.addressLine1, venue.addressLine2, venue.city, `${venue.state} ${venue.postalCode}`.trim(), venue.country],
    ', ',
  )

export const formatCoordinates = (venue: VenueRecord) =>
  venue.latitude === null || venue.longitude === null ? '—' : `${venue.latitude}, ${venue.longitude}`

export const formatContact = (venue: VenueRecord) => joined([venue.pocName, venue.pocMobile, venue.pocEmail], ' · ')

export const formatActive = (venue: VenueRecord) => (venue.isActive ? 'Yes' : 'No')
