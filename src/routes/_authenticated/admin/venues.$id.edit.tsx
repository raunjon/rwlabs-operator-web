import { createFileRoute } from '@tanstack/react-router'
import { EditVenuePage } from '@/features/venues/venue-pages'

export const Route = createFileRoute('/_authenticated/admin/venues/$id/edit')({
  component: function AdminEditVenueRoute() {
    const { id } = Route.useParams()
    // Keyed by id so moving between venues starts each one's form afresh.
    return <EditVenuePage key={id} id={id} />
  },
})
