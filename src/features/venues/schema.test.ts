import { describe, expect, it } from 'vitest'
import type { VenueRecord } from './api'
import { EMPTY_VENUE_FIELDS, toFormFields, toVenueInput, venueFormSchema, type VenueFormFields } from './schema'

const fields = (overrides: Partial<VenueFormFields> = {}): VenueFormFields => ({
  ...EMPTY_VENUE_FIELDS,
  name: 'Skyline Rooftop',
  ...overrides,
})

const errorsOf = (values: VenueFormFields) => {
  const result = venueFormSchema.safeParse(values)
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('venueFormSchema', () => {
  it('a new venue starts active, with everything else empty', () => {
    expect(EMPTY_VENUE_FIELDS.isActive).toBe(true)
    expect(EMPTY_VENUE_FIELDS.name).toBe('')
    expect(EMPTY_VENUE_FIELDS.amenities).toEqual([])
  })

  it('needs a name, and only a name', () => {
    expect(errorsOf(fields({ name: '  ' }))).toEqual({ name: 'Enter a name' })
    expect(errorsOf(fields())).toEqual({})
  })

  it.each(['19.0596', '-33.8688', '90', '-90', ' 12 ', '0.000001'])('takes latitude %s', (latitude) => {
    expect(errorsOf(fields({ latitude }))).toEqual({})
  })

  it.each(['90.1', '-91', 'north', '1e2', '12,5'])('refuses latitude %s', (latitude) => {
    expect(errorsOf(fields({ latitude }))).toEqual({ latitude: 'Enter a latitude between -90 and 90' })
  })

  it.each(['72.8295', '-180', '180'])('takes longitude %s', (longitude) => {
    expect(errorsOf(fields({ longitude }))).toEqual({})
  })

  it.each(['180.5', '-200', 'east'])('refuses longitude %s', (longitude) => {
    expect(errorsOf(fields({ longitude }))).toEqual({ longitude: 'Enter a longitude between -180 and 180' })
  })

  it('capacities are whole numbers of 0 or more', () => {
    expect(errorsOf(fields({ totalCapacity: '120', seatingCapacity: '0' }))).toEqual({})
    expect(errorsOf(fields({ totalCapacity: '12.5', seatingCapacity: '-1' }))).toEqual({
      totalCapacity: 'Enter a whole number of 0 or more',
      seatingCapacity: 'Enter a whole number of 0 or more',
    })
  })

  it('a contact email, when given, looks like one', () => {
    expect(errorsOf(fields({ pocEmail: 'rohan@skyline.example' }))).toEqual({})
    expect(errorsOf(fields({ pocEmail: 'rohan' }))).toEqual({ pocEmail: 'Enter an email address like name@example.com' })
  })
})

describe('toVenueInput', () => {
  it('trims text and turns numbers into numbers, empty ones into null', () => {
    expect(
      toVenueInput(
        fields({
          name: ' Skyline ',
          city: ' Mumbai ',
          latitude: ' 19.0596 ',
          longitude: '',
          totalCapacity: '120',
          seatingCapacity: '',
          amenities: ['parking'],
          isActive: false,
        }),
      ),
    ).toMatchObject({
      name: 'Skyline',
      city: 'Mumbai',
      latitude: 19.0596,
      longitude: null,
      totalCapacity: 120,
      seatingCapacity: null,
      amenities: ['parking'],
      isActive: false,
    })
  })
})

describe('toFormFields', () => {
  it('fills the form from a venue, and round-trips', () => {
    const venue: VenueRecord = {
      id: 1,
      name: 'Skyline Rooftop',
      subtitle: '',
      description: '',
      addressLine1: '14 Hill Road',
      addressLine2: '',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400050',
      country: 'India',
      latitude: '19.059600',
      longitude: null,
      totalCapacity: 120,
      seatingCapacity: null,
      pocName: '',
      pocMobile: '',
      pocEmail: '',
      website: '',
      zomatoUrl: '',
      imageUrl: '',
      amenities: ['parking'],
      isActive: false,
    }
    const form = toFormFields(venue)
    expect(form).toMatchObject({ latitude: '19.059600', longitude: '', totalCapacity: '120', seatingCapacity: '', isActive: false })
    expect(toVenueInput(form)).toMatchObject({ latitude: 19.0596, longitude: null, totalCapacity: 120, seatingCapacity: null })
  })
})
