import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { EventRecord, Venue } from './api'
import { EVENT_PATHS, showsTenant, type EventsArea } from './areas'
import { eventFailure, eventsQuery, venuesQuery } from './events'
import { formatEventTime, formatPrices } from './format'
import { hasFilters, toListParams, type EventSearch } from './search'

const filterSchema = z.object({
  search: z.string(),
  venueId: z.string(),
  tenantId: z
    .string()
    .trim()
    .refine((value) => value === '' || /^[1-9]\d*$/.test(value), 'The tenant id is a whole number above 0'),
})

type FilterFields = z.infer<typeof filterSchema>

const filterFields = (search: EventSearch): FilterFields => ({
  search: search.search ?? '',
  venueId: search.venue_id === undefined ? '' : String(search.venue_id),
  tenantId: search.tenant_id === undefined ? '' : String(search.tenant_id),
})

// OW-14: the events list, shared by the tenant area (the admin's own events) and the super admin area (every
// tenant's, with a Tenant column and filter). Filters and page live in the URL; the server does the filtering.
export function EventsListPage({ area, search }: { area: EventsArea; search: EventSearch }) {
  const paths = EVENT_PATHS[area]
  const events = useQuery(eventsQuery(toListParams(search)))
  const venues = useQuery(venuesQuery)

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{showsTenant(area) ? 'All organisations' : 'Your organisation'}</p>
          <h1 className="text-2xl font-semibold">Events</h1>
        </div>
        <Button asChild>
          <Link to={paths.new}>New event</Link>
        </Button>
      </div>

      <Filters area={area} search={search} venues={venues.data ?? []} />

      {venues.isError && (
        // The events still list without venues; only their names and the venue filter are missing.
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertDescription>
              Venue names and the venue filter aren’t available. {eventFailure(venues.error).message}
            </AlertDescription>
          </Alert>
          <Button type="button" variant="outline" size="sm" onClick={() => void venues.refetch()} disabled={venues.isFetching}>
            {venues.isFetching ? 'Reloading venues…' : 'Reload venues'}
          </Button>
        </div>
      )}

      {events.isPending ? (
        <div role="status" aria-label="Loading events" className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : events.isError ? (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>{eventFailure(events.error).message}</AlertDescription>
          </Alert>
          <Button type="button" variant="outline" onClick={() => void events.refetch()} disabled={events.isFetching}>
            {events.isFetching ? 'Trying again…' : 'Try again'}
          </Button>
        </div>
      ) : events.data.events.length === 0 ? (
        <EmptyState area={area} search={search} pastTheEnd={(search.page ?? 1) > 1} />
      ) : (
        <>
          <EventsTable area={area} events={events.data.events} venues={venues.data ?? []} />
          <Pagination
            area={area}
            search={search}
            currentPage={events.data.currentPage}
            totalPages={events.data.totalPages}
            totalCount={events.data.totalCount}
          />
        </>
      )}
    </div>
  )
}

function Filters({ area, search, venues }: { area: EventsArea; search: EventSearch; venues: Venue[] }) {
  const navigate = useNavigate()
  const form = useForm<FilterFields>({ resolver: zodResolver(filterSchema), defaultValues: filterFields(search) })
  const { errors } = form.formState

  // The URL is the source of truth: follow it when it changes (Clear filters, Back, a pasted link).
  const { search: term, venue_id: venueId, tenant_id: tenantId } = search
  useEffect(() => {
    form.reset(filterFields({ search: term, venue_id: venueId, tenant_id: tenantId }))
  }, [form, term, venueId, tenantId])

  function apply(fields: FilterFields) {
    void navigate({
      to: EVENT_PATHS[area].list,
      search: {
        search: fields.search.trim() || undefined,
        venue_id: fields.venueId ? Number(fields.venueId) : undefined,
        tenant_id: fields.tenantId.trim() ? Number(fields.tenantId) : undefined,
      },
    })
  }

  return (
    <form
      role="search"
      aria-label="Filter events"
      noValidate
      onSubmit={form.handleSubmit(apply)}
      className="flex flex-wrap items-end gap-4"
    >
      <Field id={`${area}-events-search`} label="Search" className="w-64">
        <Input type="search" autoComplete="off" {...form.register('search')} />
      </Field>
      <Controller
        control={form.control}
        name="venueId"
        render={({ field }) => (
          <Field id={`${area}-events-venue`} label="Venue" className="w-56">
            <NativeSelect {...field}>
              <option value="">All venues</option>
              {venues.map((venue) => (
                <option key={venue.id} value={String(venue.id)}>
                  {venue.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
      />
      {showsTenant(area) && (
        <Field id={`${area}-events-tenant`} label="Tenant id" error={errors.tenantId?.message} className="w-40">
          <Input type="text" inputMode="numeric" autoComplete="off" {...form.register('tenantId')} />
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          Apply filters
        </Button>
        {hasFilters(search) && (
          <Button type="button" variant="ghost" onClick={() => void navigate({ to: EVENT_PATHS[area].list, search: {} })}>
            Clear filters
          </Button>
        )}
      </div>
    </form>
  )
}

function EmptyState({ area, search, pastTheEnd }: { area: EventsArea; search: EventSearch; pastTheEnd: boolean }) {
  const paths = EVENT_PATHS[area]
  if (pastTheEnd) {
    return (
      <div className="space-y-2 text-sm">
        <p>There’s nothing on this page.</p>
        <Link to={paths.list} search={{ ...search, page: undefined }} className="text-link underline-offset-4 hover:underline">
          Go to the first page
        </Link>
      </div>
    )
  }
  if (hasFilters(search)) return <p className="text-sm">No events match these filters.</p>
  return (
    <div className="space-y-3 text-sm">
      <p>No events yet.</p>
      <Button asChild>
        <Link to={paths.new}>Create your first event</Link>
      </Button>
    </div>
  )
}

function EventsTable({ area, events, venues }: { area: EventsArea; events: EventRecord[]; venues: Venue[] }) {
  const venueNames = new Map(venues.map((venue) => [venue.id, venue.name]))
  const withTenant = showsTenant(area)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          {withTenant && <TableHead>Tenant</TableHead>}
          <TableHead>Starts</TableHead>
          <TableHead>Venue</TableHead>
          <TableHead>Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell>
              <Link
                to={EVENT_PATHS[area].detail}
                params={{ id: String(event.id) }}
                // Foreground, not link blue: link on the row's hover accent is below 4.5:1.
                className="font-medium underline underline-offset-4"
              >
                {event.title || `Event ${event.id}`}
              </Link>
            </TableCell>
            {withTenant && <TableCell>{event.tenantId ?? '—'}</TableCell>}
            <TableCell className="whitespace-nowrap">{formatEventTime(event.startTime)}</TableCell>
            <TableCell>
              {event.venueId === null ? '—' : (venueNames.get(event.venueId) ?? `Venue ${event.venueId}`)}
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatPrices(event.basePrice, event.coverPrice)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Pagination({
  area,
  search,
  currentPage,
  totalPages,
  totalCount,
}: {
  area: EventsArea
  search: EventSearch
  currentPage: number
  totalPages: number | null
  totalCount: number | null
}) {
  if (totalPages === null) return null
  const to = EVENT_PATHS[area].list
  const linkClass = 'text-link underline-offset-4 hover:underline'
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-4 text-sm">
      <p className="text-muted-foreground">
        Page {currentPage} of {totalPages}
        {totalCount !== null && ` · ${totalCount} event${totalCount === 1 ? '' : 's'}`}
      </p>
      <div className="flex gap-4">
        {currentPage > 1 && (
          <Link to={to} search={{ ...search, page: currentPage - 1 > 1 ? currentPage - 1 : undefined }} className={linkClass}>
            Previous page
          </Link>
        )}
        {currentPage < totalPages && (
          <Link to={to} search={{ ...search, page: currentPage + 1 }} className={linkClass}>
            Next page
          </Link>
        )}
      </div>
    </nav>
  )
}
