import { createFileRoute } from '@tanstack/react-router'
import { EventDetailPage } from '@/features/events/event-pages'

export const Route = createFileRoute('/_authenticated/t/events/$id')({
  component: function TenantEventRoute() {
    const { id } = Route.useParams()
    // Keyed by id so moving between events starts each one's form afresh.
    return <EventDetailPage key={id} area="tenant" id={id} />
  },
})
