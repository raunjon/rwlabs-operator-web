import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { EventRecord } from './api'
import { EVENT_PATHS, showsTenant, type EventsArea } from './areas'
import { EventForm } from './event-form'
import {
  EVENT_NOT_FOUND_MESSAGE,
  eventFailure,
  eventQuery,
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
} from './events'
import { EMPTY_EVENT_FIELDS, toEventInput, toFormFields } from './schema'

const backLinkClass = 'text-sm text-link underline-offset-4 hover:underline'

function PageHeading({ area, title }: { area: EventsArea; title: string }) {
  return (
    <div className="space-y-2">
      <Link to={EVENT_PATHS[area].list} className={backLinkClass}>
        All events
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
    </div>
  )
}

// /t/events/new and /admin/events/new. The super admin's form asks for the tenant; on success both go back to the
// list, which the mutation has already marked stale.
export function NewEventPage({ area }: { area: EventsArea }) {
  const navigate = useNavigate()
  const create = useCreateEvent()
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeading area={area} title="New event" />
      <EventForm
        idPrefix="event-new"
        defaults={EMPTY_EVENT_FIELDS}
        askTenant={showsTenant(area)}
        keepFeatures={false}
        submitLabel="Create event"
        pendingLabel="Creating event…"
        busy={create.isPending}
        failure={create.isError ? eventFailure(create.error) : null}
        onSubmit={(fields) =>
          create.mutate(toEventInput(fields), { onSuccess: () => void navigate({ to: EVENT_PATHS[area].list }) })
        }
      />
    </div>
  )
}

// /t/events/{id} and /admin/events/{id}: the event's fields as an edit form, plus delete. An id that isn't a
// positive whole number can't be an event, so it is shown as missing without asking the server.
export function EventDetailPage({ area, id }: { area: EventsArea; id: string }) {
  const eventId = /^[1-9]\d*$/.test(id) ? Number(id) : null
  if (eventId === null) return <MissingEvent area={area} />
  return <EventDetail area={area} id={eventId} />
}

function MissingEvent({ area }: { area: EventsArea }) {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Event</h1>
      <Alert variant="destructive">
        <AlertDescription>{EVENT_NOT_FOUND_MESSAGE}</AlertDescription>
      </Alert>
      <Link to={EVENT_PATHS[area].list} className={backLinkClass}>
        Back to events
      </Link>
    </div>
  )
}

function EventDetail({ area, id }: { area: EventsArea; id: number }) {
  const event = useQuery(eventQuery(id))
  // A cached copy (the admin was here before) is refetched on arrival. Wait for that answer: the form takes its
  // starting values once, and a save sends every field, so a stale copy would overwrite newer changes.
  const refreshing = event.isFetching && !event.isFetchedAfterMount

  if (event.isPending || refreshing) {
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeading area={area} title="Event" />
        <div role="status" aria-label="Loading the event" className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }
  if (event.isError) {
    const failure = eventFailure(event.error)
    if (failure.kind === 'not-found') return <MissingEvent area={area} />
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeading area={area} title="Event" />
        <Alert variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" onClick={() => void event.refetch()} disabled={event.isFetching}>
          {event.isFetching ? 'Trying again…' : 'Try again'}
        </Button>
      </div>
    )
  }
  return <EditEvent area={area} event={event.data} />
}

function EditEvent({ area, event }: { area: EventsArea; event: EventRecord }) {
  const update = useUpdateEvent(event.id)
  // Keeps the form's starting values from the event as it was when the page opened; a save refreshes the
  // heading but leaves the admin's form as they typed it.
  const [defaults] = useState(() => toFormFields(event))
  // From the latest saved event, not the opening one: once a save stores the first feature, it can't be cleared.
  const keepFeatures = event.features.length > 0
  const { isSuccess: saved, reset: resetUpdate } = update

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeading area={area} title={event.title || `Event ${event.id}`} />
      {showsTenant(area) && (
        <p className="text-sm text-muted-foreground">Tenant {event.tenantId ?? 'unknown'}</p>
      )}
      <EventForm
        idPrefix={`event-${event.id}`}
        defaults={defaults}
        askTenant={false}
        keepFeatures={keepFeatures}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        busy={update.isPending}
        failure={update.isError ? eventFailure(update.error) : null}
        onSubmit={(fields) => update.mutate(toEventInput(fields))}
        // "Event saved." describes the form as it was sent; the first edit after that makes it untrue.
        onEdit={saved ? resetUpdate : undefined}
        footer={
          saved && (
            <p role="status" className="text-sm text-success">
              Event saved.
            </p>
          )
        }
      />
      <DeleteEventCard area={area} event={event} />
    </div>
  )
}

function DeleteEventCard({ area, event }: { area: EventsArea; event: EventRecord }) {
  const navigate = useNavigate()
  const remove = useDeleteEvent(event.id)
  const [confirming, setConfirming] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const failure = remove.isError ? eventFailure(remove.error) : null

  // Focus moves to the safe choice when the confirm step opens.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
  }, [confirming])

  return (
    <section aria-labelledby="delete-event-heading">
      <Card>
        <CardHeader>
          <h2 id="delete-event-heading" className="font-semibold">
            Delete event
          </h2>
          <CardDescription>Removes the event for good.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {failure && (
            <Alert variant="destructive">
              <AlertDescription>{failure.message}</AlertDescription>
            </Alert>
          )}
          {confirming ? (
            <div role="group" aria-label="Confirm delete" className="space-y-3">
              <p className="text-sm">Delete “{event.title}”? This can’t be undone.</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(undefined, { onSuccess: () => void navigate({ to: EVENT_PATHS[area].list }) })
                  }
                >
                  {remove.isPending ? 'Deleting…' : 'Yes, delete event'}
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
              Delete event
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
