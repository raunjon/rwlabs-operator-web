import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { ChipInput } from '@/components/chip-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { venueFormSchema, type VenueFormFields } from './schema'
import type { VenueFailure } from './venues'

const KEEP_AN_AMENITY_MESSAGE = 'Keep at least one amenity: removing them all isn’t supported yet.'

type TextName = Exclude<keyof VenueFormFields, 'amenities' | 'isActive'>

// The super admin's create and edit form for a venue. Server failures show at form level.
//
// `keepAmenities` (edit, when the venue already has amenities): the gateway forwards bodies form-encoded, which
// turns an empty list into [""], so the API layer leaves an empty list out and the stored amenities would stay as
// they are. Rather than pretend to clear them, the form says it can't.
export function VenueForm({
  idPrefix,
  defaults,
  keepAmenities,
  submitLabel,
  pendingLabel,
  busy,
  failure,
  onSubmit,
  onEdit,
  footer,
}: {
  idPrefix: string
  defaults: VenueFormFields
  keepAmenities: boolean
  submitLabel: string
  pendingLabel: string
  busy: boolean
  failure: VenueFailure | null
  onSubmit: (fields: VenueFormFields) => void
  // Called on every change to a field's value.
  onEdit?: () => void
  footer?: ReactNode
}) {
  const form = useForm<VenueFormFields>({ resolver: zodResolver(venueFormSchema), defaultValues: defaults })
  const { errors } = form.formState
  const id = (name: string) => `${idPrefix}-${name}`

  useEffect(() => {
    if (!onEdit) return
    return form.subscribe({ formState: { values: true }, callback: () => onEdit() })
  }, [form, onEdit])

  function submit(fields: VenueFormFields) {
    if (keepAmenities && fields.amenities.length === 0) {
      form.setError('amenities', { message: KEEP_AN_AMENITY_MESSAGE })
      return
    }
    onSubmit(fields)
  }

  // A one-line text field. Every field but the name is optional.
  const text = (name: TextName, label: string, type: 'text' | 'url' | 'email' | 'tel' = 'text', inputMode?: 'decimal' | 'numeric') => (
    <Field id={id(name)} label={name === 'name' ? label : `${label} (optional)`} error={errors[name]?.message}>
      <Input type={type} inputMode={inputMode} autoComplete="off" {...form.register(name)} />
    </Field>
  )

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-6">
      <fieldset disabled={busy} className="space-y-4">
        {text('name', 'Name')}
        {text('subtitle', 'Subtitle')}
        <Field id={id('description')} label="Description (optional)">
          <Textarea rows={4} {...form.register('description')} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {text('addressLine1', 'Address line 1')}
          {text('addressLine2', 'Address line 2')}
          {text('city', 'City')}
          {text('state', 'State')}
          {text('postalCode', 'Postal code')}
          {text('country', 'Country')}
          {text('latitude', 'Latitude', 'text', 'decimal')}
          {text('longitude', 'Longitude', 'text', 'decimal')}
          {text('totalCapacity', 'Total capacity', 'text', 'numeric')}
          {text('seatingCapacity', 'Seating capacity', 'text', 'numeric')}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {text('pocName', 'Contact name')}
          {text('pocMobile', 'Contact mobile', 'tel')}
          {text('pocEmail', 'Contact email', 'email')}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {text('website', 'Website', 'url')}
          {text('zomatoUrl', 'Zomato URL', 'url')}
          {text('imageUrl', 'Image URL', 'url')}
        </div>

        <Controller
          control={form.control}
          name="amenities"
          render={({ field }) => (
            <ChipInput
              id={id('amenities')}
              label="Amenities"
              noun="amenity"
              listLabel="Added amenities"
              value={field.value}
              onChange={(amenities) => {
                field.onChange(amenities)
                form.clearErrors('amenities')
              }}
              error={errors.amenities?.message}
            />
          )}
        />

        <div className="flex items-center gap-2">
          <input id={id('active')} type="checkbox" className="size-4 accent-primary" {...form.register('isActive')} />
          <Label htmlFor={id('active')}>Active</Label>
        </div>
      </fieldset>

      {failure && (
        <Alert variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
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
