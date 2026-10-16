import { createFileRoute } from '@tanstack/react-router'
import { VenueDetailPage } from '@/features/venues/venue-pages'

// `venues.$id.index` rather than `venues.$id`: the latter would be the parent of `venues.$id.edit` and have to
// render it through an <Outlet />.
export const Route = createFileRoute('/_authenticated/admin/venues/$id/')({
  component: function AdminVenueRoute() {
    const { id } = Route.useParams()
    return <VenueDetailPage key={id} area="admin" id={id} />
  },
})
