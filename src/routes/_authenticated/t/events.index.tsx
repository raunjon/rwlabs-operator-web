import { createFileRoute } from '@tanstack/react-router'
import { EventsListPage } from '@/features/events/events-list-page'
import { parseEventSearch } from '@/features/events/search'

export const Route = createFileRoute('/_authenticated/t/events/')({
  validateSearch: (search: Record<string, unknown>) => parseEventSearch(search, { withTenant: false }),
  component: function TenantEventsRoute() {
    return <EventsListPage area="tenant" search={Route.useSearch()} />
  },
})
