import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { VenueRecord } from './api'
import { ADMIN_VENUE_PATHS, canManage, VENUE_PATHS, type VenueSearch, type VenuesArea } from './areas'
import { formatActive, formatCapacity, formatPlace } from './format'
import { venueFailure, venuePageQuery } from './venues'

// OW-15: the venues list, shared by the tenant area (read-only) and the super admin area (with New venue). The
// page lives in the URL.
export function VenuesListPage({ area, search }: { area: VenuesArea; search: VenueSearch }) {
  const page = search.page ?? 1
  const venues = useQuery(venuePageQuery(page))

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Shared by every organisation</p>
          <h1 className="text-2xl font-semibold">Venues</h1>
        </div>
        {canManage(area) && (
          <Button asChild>
            <Link to={ADMIN_VENUE_PATHS.new}>New venue</Link>
          </Button>
        )}
      </div>

      {venues.isPending ? (
        <div role="status" aria-label="Loading venues" className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : venues.isError ? (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>{venueFailure(venues.error).message}</AlertDescription>
          </Alert>
          <Button type="button" variant="outline" onClick={() => void venues.refetch()} disabled={venues.isFetching}>
            {venues.isFetching ? 'Trying again…' : 'Try again'}
          </Button>
        </div>
      ) : venues.data.venues.length === 0 ? (
        <EmptyState area={area} pastTheEnd={page > 1} />
      ) : (
        <>
          <VenuesTable area={area} venues={venues.data.venues} />
          <Pagination
            area={area}
            currentPage={venues.data.currentPage}
            totalPages={venues.data.totalPages}
            totalCount={venues.data.totalCount}
          />
        </>
      )}
    </div>
  )
}

const linkClass = 'text-link underline-offset-4 hover:underline'

function EmptyState({ area, pastTheEnd }: { area: VenuesArea; pastTheEnd: boolean }) {
  if (pastTheEnd) {
    return (
      <div className="space-y-2 text-sm">
        <p>There’s nothing on this page.</p>
        <Link to={VENUE_PATHS[area].list} className={linkClass}>
          Go to the first page
        </Link>
      </div>
    )
  }
  return (
    <div className="space-y-3 text-sm">
      <p>No venues yet.</p>
      {canManage(area) && (
        <Button asChild>
          <Link to={ADMIN_VENUE_PATHS.new}>Add your first venue</Link>
        </Button>
      )}
    </div>
  )
}

function VenuesTable({ area, venues }: { area: VenuesArea; venues: VenueRecord[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>City / state</TableHead>
          <TableHead>Capacity</TableHead>
          <TableHead>Active</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {venues.map((venue) => (
          <TableRow key={venue.id}>
            <TableCell>
              <Link
                to={VENUE_PATHS[area].detail}
                params={{ id: String(venue.id) }}
                // Foreground, not link blue: link on the row's hover accent is below 4.5:1.
                className="font-medium underline underline-offset-4"
              >
                {venue.name || `Venue ${venue.id}`}
              </Link>
            </TableCell>
            <TableCell>{formatPlace(venue)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatCapacity(venue)}</TableCell>
            <TableCell>{formatActive(venue)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Pagination({
  area,
  currentPage,
  totalPages,
  totalCount,
}: {
  area: VenuesArea
  currentPage: number
  totalPages: number | null
  totalCount: number | null
}) {
  if (totalPages === null) return null
  const to = VENUE_PATHS[area].list
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-4 text-sm">
      <p className="text-muted-foreground">
        Page {currentPage} of {totalPages}
        {totalCount !== null && ` · ${totalCount} venue${totalCount === 1 ? '' : 's'}`}
      </p>
      <div className="flex gap-4">
        {currentPage > 1 && (
          <Link to={to} search={{ page: currentPage - 1 > 1 ? currentPage - 1 : undefined }} className={linkClass}>
            Previous page
          </Link>
        )}
        {currentPage < totalPages && (
          <Link to={to} search={{ page: currentPage + 1 }} className={linkClass}>
            Next page
          </Link>
        )}
      </div>
    </nav>
  )
}
