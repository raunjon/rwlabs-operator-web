import { createFileRoute } from '@tanstack/react-router'
import { parseVenueSearch } from '@/features/venues/areas'
import { VenuesListPage } from '@/features/venues/venues-list-page'

export const Route = createFileRoute('/_authenticated/admin/venues/')({
  validateSearch: parseVenueSearch,
  component: function AdminVenuesRoute() {
    return <VenuesListPage area="admin" search={Route.useSearch()} />
  },
})
