// The two places the venue screens live. Venues are shared across tenants, so both areas list the same venues;
// only a super admin may add, edit or delete them (the operator refuses anyone else with 403).
export type VenuesArea = 'tenant' | 'admin'

export const VENUE_PATHS = {
  tenant: { list: '/t/venues', detail: '/t/venues/$id' },
  admin: { list: '/admin/venues', detail: '/admin/venues/$id' },
} as const

export const ADMIN_VENUE_PATHS = { new: '/admin/venues/new', edit: '/admin/venues/$id/edit' } as const

export const canManage = (area: VenuesArea) => area === 'admin'

// The list's page, kept in the URL (AGENTS.md §4). Page 1 is the bare path.
export interface VenueSearch {
  page?: number
}

export function parseVenueSearch(search: Record<string, unknown>): VenueSearch {
  const page = search.page
  return { page: typeof page === 'number' && Number.isInteger(page) && page > 1 ? page : undefined }
}
