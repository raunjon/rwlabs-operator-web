import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { ChipInput } from '@/components/chip-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { eventFailure, venuesQuery, type EventFailure } from './events'
import { eventFormSchema, type EventFormFields } from './schema'

const KEEP_A_FEATURE_MESSAGE = 'Keep at least one feature: removing them all isn’t supported yet.'

// The create and edit form for an event. `askTenant` adds the required Tenant id field (the super admin's create
// form); the tenant screens never show or send a tenant. Server failures show at form level, except the
// operator's "Tenant required", which belongs to the Tenant id field.
//
// `keepFeatures` (edit, when the event already has features): the gateway forwards bodies form-encoded, which
// turns an empty list into [""], so the API layer leaves an empty list out — and the stored features would stay
// as they are. Rather than pretend to clear them, the form says it can't.
export function EventForm({
  idPrefix,
  defaults,
  askTenant,
  keepFeatures,
  submitLabel,
  pendingLabel,
  busy,
  failure,
  onSubmit,
  onEdit,
  footer,
}: {
  idPrefix: string
  defaults: EventFormFields
  askTenant: boolean
  keepFeatures: boolean
  submitLabel: string
  pendingLabel: string
  busy: boolean
  failure: EventFailure | null
  onSubmit: (fields: EventFormFields) => void
  // Called on every change to a field's value.
  onEdit?: () => void
  footer?: ReactNode
}) {
  const venues = useQuery(venuesQuery)
  const venuesFailure = venues.isError ? eventFailure(venues.error) : null
  const form = useForm<EventFormFields>({
    resolver: zodResolver(eventFormSchema({ requireTenant: askTenant })),
    defaultValues: defaults,
  })
  const { errors } = form.formState
  const tenantFailure = askTenant && failure?.kind === 'tenant-required' ? failure.message : undefined
  const formFailure = failure && !tenantFailure ? failure.message : null
  const id = (name: string) => `${idPrefix}-${name}`

  useEffect(() => {
    if (!onEdit) return
    return form.subscribe({ formState: { values: true }, callback: () => onEdit() })
  }, [form, onEdit])

  function submit(fields: EventFormFields) {
    if (keepFeatures && fields.features.length === 0) {
      form.setError('features', { message: KEEP_A_FEATURE_MESSAGE })
      return
    }
    onSubmit(fields)
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-6">
      <fieldset disabled={busy} className="space-y-4">
        {askTenant && (
          <Field
            id={id('tenant')}
            label="Tenant id"
            hint="The organisation this event belongs to. It can’t be changed later."
            error={errors.tenantId?.message ?? tenantFailure}
            className="max-w-xs"
          >
            <Input type="text" inputMode="numeric" autoComplete="off" {...form.register('tenantId')} />
          </Field>
        )}
        <Field id={id('title')} label="Title" error={errors.title?.message}>
          <Input type="text" autoComplete="off" {...form.register('title')} />
        </Field>
        <Field id={id('description')} label="Description (optional)">
          <Textarea rows={4} {...form.register('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={id('start')} label="Starts" hint="In your time zone." error={errors.startTime?.message}>
            <Input type="datetime-local" {...form.register('startTime')} />
          </Field>
          <Field id={id('end')} label="Ends" error={errors.endTime?.message}>
            <Input type="datetime-local" {...form.register('endTime')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {venues.isPending ? (
            // The select appears once its options have arrived; until then, an announced placeholder.
            <div role="status" aria-label="Loading venues" className="space-y-2">
              <p className="text-sm font-medium">Venue</p>
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <Controller
              control={form.control}
              name="venueId"
              render={({ field }) => (
                <Field id={id('venue')} label="Venue" error={errors.venueId?.message ?? venuesFailure?.message}>
                  <NativeSelect {...field}>
                    <option value="">Choose a venue</option>
                    {(venues.data ?? []).map((venue) => (
                      <option key={venue.id} value={String(venue.id)}>
                        {venue.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              )}
            />
          )}
          <Field id={id('area')} label="Area (optional)">
            <Input type="text" autoComplete="off" {...form.register('area')} />
          </Field>
        </div>
        {venuesFailure && (
          <Button type="button" variant="outline" size="sm" onClick={() => void venues.refetch()}>
            Reload venues
          </Button>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={id('base-price')} label="Base price (optional)" error={errors.basePrice?.message}>
            <Input type="text" inputMode="decimal" autoComplete="off" {...form.register('basePrice')} />
          </Field>
          <Field id={id('cover-price')} label="Cover price" error={errors.coverPrice?.message}>
            <Input type="text" inputMode="decimal" autoComplete="off" {...form.register('coverPrice')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={id('max-tickets')} label="Max tickets (optional)" error={errors.maxTickets?.message}>
            <Input type="text" inputMode="numeric" autoComplete="off" {...form.register('maxTickets')} />
          </Field>
          <Field id={id('max-male')} label="Max male tickets (optional)" error={errors.maxMaleTickets?.message}>
            <Input type="text" inputMode="numeric" autoComplete="off" {...form.register('maxMaleTickets')} />
          </Field>
          <Field id={id('max-female')} label="Max female tickets (optional)" error={errors.maxFemaleTickets?.message}>
            <Input type="text" inputMode="numeric" autoComplete="off" {...form.register('maxFemaleTickets')} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={id('image-vertical')} label="Vertical image URL (optional)">
            <Input type="url" autoComplete="off" {...form.register('imageUrlVertical')} />
          </Field>
          <Field id={id('image-horizontal')} label="Horizontal image URL (optional)">
            <Input type="url" autoComplete="off" {...form.register('imageUrlHorizontal')} />
          </Field>
        </div>
        <Controller
          control={form.control}
          name="features"
          render={({ field }) => (
            <ChipInput
              id={id('features')}
              label="Features"
              noun="feature"
              listLabel="Added features"
              value={field.value}
              onChange={(features) => {
                field.onChange(features)
                form.clearErrors('features')
              }}
              error={errors.features?.message}
            />
          )}
        />
      </fieldset>

      {formFailure && (
        <Alert variant="destructive">
          <AlertDescription>{formFailure}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={busy}>
          {busy ? pendingLabel : submitLabel}
        </Button>
        {footer}
      </div>
    </form>
  )
}
