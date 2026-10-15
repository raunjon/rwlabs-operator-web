import { describe, expect, it } from 'vitest'
import type { EventRecord } from './api'
import {
  eventFormSchema,
  fromLocalDateTime,
  toEventInput,
  toFormFields,
  toLocalDateTime,
  EMPTY_EVENT_FIELDS,
  type EventFormFields,
} from './schema'

const valid: EventFormFields = {
  ...EMPTY_EVENT_FIELDS,
  title: 'Friday Rooftop Mixer',
  startTime: '2026-10-29T19:00',
  endTime: '2026-10-29T23:00',
  venueId: '1',
}

function errors(fields: EventFormFields, options = { requireTenant: false }): Record<string, string> {
  const result = eventFormSchema(options).safeParse(fields)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('eventFormSchema', () => {
  it('accepts the minimal valid form (cover price defaults to 0)', () => {
    expect(EMPTY_EVENT_FIELDS.coverPrice).toBe('0')
    expect(errors(valid)).toEqual({})
  })

  it('requires a title, start, end and venue, like the operator’s Event model', () => {
    expect(errors({ ...valid, title: '  ', startTime: '', endTime: '', venueId: '' })).toEqual({
      title: 'Enter a title',
      startTime: 'Pick when the event starts',
      endTime: 'Pick when the event ends',
      venueId: 'Pick a venue',
    })
  })

  it('wants the end after the start', () => {
    expect(errors({ ...valid, endTime: '2026-10-29T19:00' })).toEqual({
      endTime: 'The end must be after the start',
    })
    expect(errors({ ...valid, endTime: '2026-10-29T18:00' })).toEqual({
      endTime: 'The end must be after the start',
    })
  })

  it('wants prices to be numbers of 0 or more; the base price may be empty, the cover price may not', () => {
    expect(errors({ ...valid, basePrice: '', coverPrice: '0' })).toEqual({})
    expect(errors({ ...valid, basePrice: 'abc', coverPrice: '-1' })).toEqual({
      basePrice: 'Enter a price of 0 or more',
      coverPrice: 'Enter a price of 0 or more',
    })
    expect(errors({ ...valid, coverPrice: '' })).toEqual({ coverPrice: 'Enter a price of 0 or more' })
    expect(errors({ ...valid, basePrice: '1499.50' })).toEqual({})
  })

  it('wants ticket limits to be whole numbers of 0 or more, or empty', () => {
    expect(errors({ ...valid, maxTickets: '80', maxMaleTickets: '0', maxFemaleTickets: '' })).toEqual({})
    expect(errors({ ...valid, maxTickets: '1.5', maxMaleTickets: '-2', maxFemaleTickets: 'ten' })).toEqual({
      maxTickets: 'Enter a whole number of 0 or more',
      maxMaleTickets: 'Enter a whole number of 0 or more',
      maxFemaleTickets: 'Enter a whole number of 0 or more',
    })
  })

  it('only asks for a tenant id when told to (the super admin’s create form)', () => {
    expect(errors({ ...valid, tenantId: '' })).toEqual({})
    expect(errors({ ...valid, tenantId: '' }, { requireTenant: true })).toEqual({ tenantId: 'Enter the tenant id' })
    expect(errors({ ...valid, tenantId: '0' }, { requireTenant: true })).toEqual({
      tenantId: 'The tenant id is a whole number above 0',
    })
    expect(errors({ ...valid, tenantId: '9' }, { requireTenant: true })).toEqual({})
  })
})

describe('local date-times', () => {
  it('round-trip between the datetime-local value and milliseconds in the browser’s zone', () => {
    const ms = fromLocalDateTime('2026-10-29T19:00')
    expect(ms).toBe(new Date(2026, 9, 29, 19, 0).getTime())
    expect(toLocalDateTime(ms)).toBe('2026-10-29T19:00')
  })

  it('an empty or unknown time gives an empty value', () => {
    expect(toLocalDateTime(null)).toBe('')
  })
})

describe('toEventInput', () => {
  it('turns the form into what the API layer sends, trimming text and leaving empty numbers null', () => {
    expect(
      toEventInput({
        ...valid,
        title: '  Friday Rooftop Mixer ',
        basePrice: '1500',
        coverPrice: '500',
        maxTickets: '80',
        features: ['welcome_drink'],
        tenantId: '9',
      }),
    ).toEqual({
      title: 'Friday Rooftop Mixer',
      description: '',
      startTime: new Date(2026, 9, 29, 19, 0).getTime(),
      endTime: new Date(2026, 9, 29, 23, 0).getTime(),
      venueId: 1,
      area: '',
      imageUrlVertical: '',
      imageUrlHorizontal: '',
      basePrice: 1500,
      coverPrice: 500,
      maxTickets: 80,
      maxMaleTickets: null,
      maxFemaleTickets: null,
      features: ['welcome_drink'],
      tenantId: 9,
    })
  })

  it('leaves tenantId out when the form has none', () => {
    expect(toEventInput(valid)).not.toHaveProperty('tenantId')
  })
})

describe('toFormFields', () => {
  it('fills the form from a saved event', () => {
    const event: EventRecord = {
      id: 12,
      title: 'Friday Rooftop Mixer',
      description: 'Drinks on the roof',
      startTime: 1793300400 * 1000,
      endTime: 1793314800 * 1000,
      venueId: 1,
      area: 'Bandra',
      imageUrlVertical: '',
      imageUrlHorizontal: '',
      basePrice: '1500.0',
      coverPrice: '500.0',
      maxTickets: null,
      maxMaleTickets: 40,
      maxFemaleTickets: 40,
      features: ['welcome_drink', 'icebreakers'],
      tenantId: 3,
    }
    expect(toFormFields(event)).toEqual({
      title: 'Friday Rooftop Mixer',
      description: 'Drinks on the roof',
      startTime: toLocalDateTime(1793300400 * 1000),
      endTime: toLocalDateTime(1793314800 * 1000),
      venueId: '1',
      area: 'Bandra',
      imageUrlVertical: '',
      imageUrlHorizontal: '',
      basePrice: '1500.0',
      coverPrice: '500.0',
      maxTickets: '',
      maxMaleTickets: '40',
      maxFemaleTickets: '40',
      features: ['welcome_drink', 'icebreakers'],
      tenantId: '3',
    })
  })
})
