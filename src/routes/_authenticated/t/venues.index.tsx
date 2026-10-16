import { createFileRoute } from '@tanstack/react-router'
import { parseVenueSearch } from '@/features/venues/areas'
import { VenuesListPage } from '@/features/venues/venues-list-page'

export const Route = createFileRoute('/_authenticated/t/venues/')({
  validateSearch: parseVenueSearch,
  component: function TenantVenuesRoute() {
    return <VenuesListPage area="tenant" search={Route.useSearch()} />
  },
})
