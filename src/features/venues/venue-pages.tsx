import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { VenueRecord } from './api'
import { ADMIN_VENUE_PATHS, canManage, VENUE_PATHS, type VenuesArea } from './areas'
import { formatActive, formatAddress, formatCapacity, formatContact, formatCoordinates } from './format'
import { EMPTY_VENUE_FIELDS, toFormFields, toVenueInput } from './schema'
import { VenueForm } from './venue-form'
import {
  useCreateVenue,
  useDeleteVenue,
  useUpdateVenue,
  VENUE_NOT_FOUND_MESSAGE,
  venueFailure,
  venueQuery,
  type VenueFailure,
} from './venues'

const backLinkClass = 'text-sm text-link underline-offset-4 hover:underline'

function PageHeading({ area, title, children }: { area: VenuesArea; title: string; children?: ReactNode }) {
  return (
    <div className="space-y-2">
      <Link to={VENUE_PATHS[area].list} className={backLinkClass}>
        All venues
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  )
}

function MissingVenue({ area }: { area: VenuesArea }) {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Venue</h1>
      <Alert variant="destructive">
        <AlertDescription>{VENUE_NOT_FOUND_MESSAGE}</AlertDescription>
      </Alert>
      <Link to={VENUE_PATHS[area].list} className={backLinkClass}>
        Back to venues
      </Link>
    </div>
  )
}

// An id that isn't a positive whole number can't be a venue, so it is shown as missing without asking the server.
const venueId = (id: string) => (/^[1-9]\d*$/.test(id) ? Number(id) : null)

// Loads the venue for the view and the edit form. A cached copy (the admin was here before) is refetched on
// arrival, and the edit form waits for that answer: it takes its starting values once, and a save sends every
// field, so a stale copy would overwrite newer changes.
function WithVenue({
  area,
  id,
  children,
}: {
  area: VenuesArea
  id: number
  children: (venue: VenueRecord) => ReactNode
}) {
  const venue = useQuery(venueQuery(id))
  const refreshing = venue.isFetching && !venue.isFetchedAfterMount

  if (venue.isPending || refreshing) {
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeading area={area} title="Venue" />
        <div role="status" aria-label="Loading the venue" className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }
  if (venue.isError) {
    const failure = venueFailure(venue.error)
    if (failure.kind === 'not-found') return <MissingVenue area={area} />
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeading area={area} title="Venue" />
        <Alert variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={() => void venue.refetch()} disabled={venue.isFetching}>
          {venue.isFetching ? 'Trying again…' : 'Try again'}
        </Button>
      </div>
    )
  }
  return <>{children(venue.data)}</>
}

// /t/venues/{id} and /admin/venues/{id}: every field of the venue, read-only. The super admin also gets Edit and
// Delete.
export function VenueDetailPage({ area, id }: { area: VenuesArea; id: string }) {
  const parsed = venueId(id)
  if (parsed === null) return <MissingVenue area={area} />
  return (
    <WithVenue area={area} id={parsed}>
      {(venue) => (
        <div className="max-w-3xl space-y-6">
          <PageHeading area={area} title={venue.name || `Venue ${venue.id}`}>
            {canManage(area) && (
              <Button asChild variant="outline">
                <Link to={ADMIN_VENUE_PATHS.edit} params={{ id: String(venue.id) }}>
                  Edit venue
                </Link>
              </Button>
            )}
          </PageHeading>
          <VenueDetails venue={venue} />
          {canManage(area) && <DeleteVenueCard venue={venue} />}
        </div>
      )}
    </WithVenue>
  )
}

function ExternalLink({ href }: { href: string }) {
  if (!href) return <>—</>
  return (
    <a href={href} target="_blank" rel="noreferrer" className="break-all text-link underline-offset-4 hover:underline">
      {href}
    </a>
  )
}

function VenueDetails({ venue }: { venue: VenueRecord }) {
  const rows: [string, ReactNode][] = [
    ['Subtitle', venue.subtitle || '—'],
    ['Description', venue.description || '—'],
    ['Address', formatAddress(venue)],
    ['Coordinates', formatCoordinates(venue)],
    ['Capacity', formatCapacity(venue)],
    ['Contact', formatContact(venue)],
    ['Website', <ExternalLink key="website" href={venue.website} />],
    ['Zomato', <ExternalLink key="zomato" href={venue.zomatoUrl} />],
    ['Image', <ExternalLink key="image" href={venue.imageUrl} />],
    ['Active', formatActive(venue)],
    [
      'Amenities',
      venue.amenities.length ? (
        <ul key="amenities" aria-label="Amenities" className="flex flex-wrap gap-2">
          {venue.amenities.map((amenity) => (
            <li key={amenity}>
              <Badge variant="secondary">{amenity}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        '—'
      ),
    ],
  ]
  return (
    <section aria-label="Venue details">
      <Card>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="font-medium text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-line">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </section>
  )
}

function FailureAlert({ failure }: { failure: VenueFailure }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <p>{failure.message}</p>
        {failure.kind === 'has-events' && <p className="text-xs">The server said: {failure.serverMessage}</p>}
      </AlertDescription>
    </Alert>
  )
}

function DeleteVenueCard({ venue }: { venue: VenueRecord }) {
  const navigate = useNavigate()
  const remove = useDeleteVenue(venue.id)
  const [confirming, setConfirming] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const failure = remove.isError ? venueFailure(remove.error) : null

  // Focus moves to the safe choice when the confirm step opens.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
  }, [confirming])

  return (
    <section aria-labelledby="delete-venue-heading">
      <Card>
        <CardHeader>
          <h2 id="delete-venue-heading" className="font-semibold">
            Delete venue
          </h2>
          <CardDescription>Removes the venue for good. A venue with events can’t be deleted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {failure && <FailureAlert failure={failure} />}
          {confirming ? (
            <div role="group" aria-label="Confirm delete" className="space-y-3">
              <p className="text-sm">Delete “{venue.name}”? This can’t be undone.</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(undefined, { onSuccess: () => void navigate({ to: VENUE_PATHS.admin.list }) })
                  }
                >
                  {remove.isPending ? 'Deleting…' : 'Yes, delete venue'}
                </Button>
                <Button
                  ref={cancelRef}
                  type="button"
                  variant="outline"
                  disabled={remove.isPending}
                  onClick={() => {
                    setConfirming(false)
                    remove.reset()
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
              Delete venue
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

// /admin/venues/new. On success, back to the list, which the mutation has already marked stale.
export function NewVenuePage() {
  const navigate = useNavigate()
  const create = useCreateVenue()
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeading area="admin" title="New venue" />
      <VenueForm
        idPrefix="venue-new"
        defaults={EMPTY_VENUE_FIELDS}
        keepAmenities={false}
        submitLabel="Create venue"
        pendingLabel="Creating venue…"
        busy={create.isPending}
        failure={create.isError ? venueFailure(create.error) : null}
        onSubmit={(fields) =>
          create.mutate(toVenueInput(fields), { onSuccess: () => void navigate({ to: VENUE_PATHS.admin.list }) })
        }
      />
    </div>
  )
}

// /admin/venues/{id}/edit: the venue's fields as a form. A save stays on the page and says so.
export function EditVenuePage({ id }: { id: string }) {
  const parsed = venueId(id)
  if (parsed === null) return <MissingVenue area="admin" />
  return <WithVenue area="admin" id={parsed}>{(venue) => <EditVenue venue={venue} />}</WithVenue>
}

function EditVenue({ venue }: { venue: VenueRecord }) {
  const update = useUpdateVenue(venue.id)
  // The form's starting values are the venue as it was when the page opened; a save refreshes the heading but
  // leaves the admin's form as they typed it.
  const [defaults] = useState(() => toFormFields(venue))
  // From the latest saved venue, not the opening one: once a save stores the first amenity, it can't be cleared.
  const keepAmenities = venue.amenities.length > 0
  const { isSuccess: saved, reset: resetUpdate } = update

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeading area="admin" title={`Edit ${venue.name || `venue ${venue.id}`}`} />
      <VenueForm
        idPrefix={`venue-${venue.id}`}
        defaults={defaults}
        keepAmenities={keepAmenities}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        busy={update.isPending}
        failure={update.isError ? venueFailure(update.error) : null}
        onSubmit={(fields) => update.mutate(toVenueInput(fields))}
        // "Venue saved." describes the form as it was sent; the first edit after that makes it untrue.
        onEdit={saved ? resetUpdate : undefined}
        footer={
          saved && (
            <p role="status" className="text-sm text-success">
              Venue saved.
            </p>
          )
        }
      />
    </div>
  )
}
