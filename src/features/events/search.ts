import type { EventListParams } from './api'

// The list's filters and page, kept in the URL (AGENTS.md §4) under the operator's own param names.
export interface EventSearch {
  page?: number
  search?: string
  venue_id?: number
  // Super admin only; the tenant route drops it.
  tenant_id?: number
}

const positiveInteger = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined

// The router parses `?search=123` as a number, so a numeric search term is turned back into text.
const searchTerm = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined

export function parseEventSearch(search: Record<string, unknown>, { withTenant }: { withTenant: boolean }): EventSearch {
  const page = positiveInteger(search.page)
  return {
    page: page && page > 1 ? page : undefined,
    search: searchTerm(search.search),
    venue_id: positiveInteger(search.venue_id),
    tenant_id: withTenant ? positiveInteger(search.tenant_id) : undefined,
  }
}

export function toListParams(search: EventSearch): EventListParams {
  return { page: search.page ?? 1, search: search.search, venueId: search.venue_id, tenantId: search.tenant_id }
}

export const hasFilters = (search: EventSearch) =>
  search.search !== undefined || search.venue_id !== undefined || search.tenant_id !== undefined
