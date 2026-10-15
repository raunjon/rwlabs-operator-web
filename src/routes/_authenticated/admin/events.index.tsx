import { createFileRoute } from '@tanstack/react-router'
import { EventsListPage } from '@/features/events/events-list-page'
import { parseEventSearch } from '@/features/events/search'

export const Route = createFileRoute('/_authenticated/admin/events/')({
  validateSearch: (search: Record<string, unknown>) => parseEventSearch(search, { withTenant: true }),
  component: function AdminEventsRoute() {
    return <EventsListPage area="admin" search={Route.useSearch()} />
  },
})
