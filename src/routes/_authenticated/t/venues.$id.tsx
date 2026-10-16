import { createFileRoute } from '@tanstack/react-router'
import { VenueDetailPage } from '@/features/venues/venue-pages'

export const Route = createFileRoute('/_authenticated/t/venues/$id')({
  component: function TenantVenueRoute() {
    const { id } = Route.useParams()
    return <VenueDetailPage key={id} area="tenant" id={id} />
  },
})
