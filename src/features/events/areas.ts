// The two places the event screens live. The screens are shared; the area decides the paths and whether the
// tenant is shown (only a super admin works across tenants).
export type EventsArea = 'tenant' | 'admin'

export const EVENT_PATHS = {
  tenant: { list: '/t/events', new: '/t/events/new', detail: '/t/events/$id' },
  admin: { list: '/admin/events', new: '/admin/events/new', detail: '/admin/events/$id' },
} as const

export const showsTenant = (area: EventsArea) => area === 'admin'
