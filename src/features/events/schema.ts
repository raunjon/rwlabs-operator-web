import { z } from 'zod'
import { required } from '@/features/auth/form-rules'
import type { EventInput, EventRecord } from './api'

// Browser checks for the event form. They mirror the operator's Event validations (title, start, end and venue
// present; end after start; prices and ticket limits 0 or more, limits whole numbers). The server checks them
// again, and anything it adds shows as one joined message at form level.

const PRICE = /^\d+(\.\d+)?$/
const WHOLE = /^\d+$/

const PRICE_MESSAGE = 'Enter a price of 0 or more'
const WHOLE_MESSAGE = 'Enter a whole number of 0 or more'

const optionalPrice = z.string().trim().refine((value) => value === '' || PRICE.test(value), PRICE_MESSAGE)
const price = z.string().trim().regex(PRICE, PRICE_MESSAGE)
const optionalWhole = z.string().trim().refine((value) => value === '' || WHOLE.test(value), WHOLE_MESSAGE)

export function eventFormSchema({ requireTenant }: { requireTenant: boolean }) {
  return z
    .object({
      title: required('Enter a title'),
      description: z.string(),
      startTime: required('Pick when the event starts'),
      endTime: required('Pick when the event ends'),
      venueId: required('Pick a venue'),
      area: z.string(),
      imageUrlVertical: z.string(),
      imageUrlHorizontal: z.string(),
      basePrice: optionalPrice,
      coverPrice: price,
      maxTickets: optionalWhole,
      maxMaleTickets: optionalWhole,
      maxFemaleTickets: optionalWhole,
      features: z.array(z.string()),
      // Only the super admin's create form asks for it; the tenant screens never show or send it.
      tenantId: requireTenant
        ? required('Enter the tenant id').refine(
            (value) => value === '' || /^[1-9]\d*$/.test(value),
            'The tenant id is a whole number above 0',
          )
        : z.string(),
    })
    .refine(
      (fields) =>
        !fields.startTime ||
        !fields.endTime ||
        fromLocalDateTime(fields.endTime) > fromLocalDateTime(fields.startTime),
      { path: ['endTime'], message: 'The end must be after the start' },
    )
}

export type EventFormFields = z.infer<ReturnType<typeof eventFormSchema>>

export const EMPTY_EVENT_FIELDS: EventFormFields = {
  title: '',
  description: '',
  startTime: '',
  endTime: '',
  venueId: '',
  area: '',
  imageUrlVertical: '',
  imageUrlHorizontal: '',
  basePrice: '',
  coverPrice: '0',
  maxTickets: '',
  maxMaleTickets: '',
  maxFemaleTickets: '',
  features: [],
  tenantId: '',
}

const pad = (n: number) => String(n).padStart(2, '0')

// A <input type="datetime-local"> value ("2026-10-29T19:00") for a moment, in the browser's own time zone. The
// operator stores UTC; the panel shows and edits times where the admin is.
export function toLocalDateTime(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// The inverse: a datetime-local value is read in the browser's time zone.
export function fromLocalDateTime(value: string): number {
  return new Date(value).getTime()
}

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value))

export function toEventInput(fields: EventFormFields): EventInput {
  const input: EventInput = {
    title: fields.title.trim(),
    description: fields.description.trim(),
    startTime: fromLocalDateTime(fields.startTime),
    endTime: fromLocalDateTime(fields.endTime),
    venueId: Number(fields.venueId),
    area: fields.area.trim(),
    imageUrlVertical: fields.imageUrlVertical.trim(),
    imageUrlHorizontal: fields.imageUrlHorizontal.trim(),
    basePrice: numberOrNull(fields.basePrice),
    coverPrice: Number(fields.coverPrice),
    maxTickets: numberOrNull(fields.maxTickets),
    maxMaleTickets: numberOrNull(fields.maxMaleTickets),
    maxFemaleTickets: numberOrNull(fields.maxFemaleTickets),
    features: fields.features,
  }
  if (fields.tenantId.trim()) input.tenantId = Number(fields.tenantId)
  return input
}

const textOf = (value: number | string | null) => (value === null ? '' : String(value))

export function toFormFields(event: EventRecord): EventFormFields {
  return {
    title: event.title,
    description: event.description,
    startTime: toLocalDateTime(event.startTime),
    endTime: toLocalDateTime(event.endTime),
    venueId: textOf(event.venueId),
    area: event.area,
    imageUrlVertical: event.imageUrlVertical,
    imageUrlHorizontal: event.imageUrlHorizontal,
    basePrice: textOf(event.basePrice),
    coverPrice: textOf(event.coverPrice),
    maxTickets: textOf(event.maxTickets),
    maxMaleTickets: textOf(event.maxMaleTickets),
    maxFemaleTickets: textOf(event.maxFemaleTickets),
    features: event.features,
    tenantId: textOf(event.tenantId),
  }
}
