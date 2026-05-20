import { describe, expect, it } from 'vitest'
import {
  buildApartmentComplexJsonLd,
  buildApartmentJsonLd,
  postalAddress,
  type JsonLdBuilding,
  type JsonLdUnit,
} from '../../src/lib/jsonld'

const BUILDING: JsonLdBuilding = {
  name: 'Grass Lake Manor Apartments',
  slug: 'grass-lake-manor',
  address_line1: '928 Rae Drive',
  address_line2: null,
  city: 'Richfield',
  state: 'MN',
  postal_code: '55423',
  country: 'US',
  description_md:
    'Grass Lake Manor offers comfortable apartment living in a quiet residential pocket of Richfield.',
  amenities: ['On-site laundry', 'Off-street parking'],
  contact_phone: '(612) 478-1122',
  contact_email: 'grasslakemanorapts@yahoo.com',
}

const UNITS: JsonLdUnit[] = [
  {
    id: 'aaaa0000-0000-0000-0000-000000000000',
    unit_number: 'S1',
    bedrooms: 0,
    bathrooms: 1,
    sqft: 800,
    monthly_rent_cents: 84500,
    available_from: '2026-06-01',
  },
  {
    id: 'aaaa1111-1111-1111-1111-111111111111',
    unit_number: '2A',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 900,
    monthly_rent_cents: 99500,
    available_from: null,
  },
]

describe('postalAddress', () => {
  it('builds a Schema.org PostalAddress', () => {
    expect(postalAddress(BUILDING)).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '928 Rae Drive',
      addressLocality: 'Richfield',
      addressRegion: 'MN',
      postalCode: '55423',
      addressCountry: 'US',
    })
  })

  it('includes address_line2 when present', () => {
    const addr = postalAddress({ ...BUILDING, address_line2: 'Suite 1' })
    expect(addr.streetAddress).toBe('928 Rae Drive, Suite 1')
  })
})

describe('buildApartmentJsonLd', () => {
  it('builds an Apartment node with offer + floorSize', () => {
    const ld = buildApartmentJsonLd(UNITS[0]!, BUILDING, 'https://ar.example/units/abc')
    expect(ld['@type']).toBe('Apartment')
    expect(ld.name).toBe('Unit S1 at Grass Lake Manor Apartments')
    expect(ld.numberOfRooms).toBe(0)
    expect(ld.numberOfBathroomsTotal).toBe(1)
    expect(ld.floorSize).toEqual({ '@type': 'QuantitativeValue', value: 800, unitCode: 'FTK' })
    expect(ld.offers.price).toBe('845.00')
    expect(ld.offers.availabilityStarts).toBe('2026-06-01')
    expect(ld.offers.url).toBe('https://ar.example/units/abc')
  })

  it('omits floorSize when sqft is null', () => {
    const ld = buildApartmentJsonLd({ ...UNITS[0]!, sqft: null }, BUILDING)
    expect(ld.floorSize).toBeUndefined()
  })
})

describe('buildApartmentComplexJsonLd', () => {
  it('emits ApartmentComplex with required fields', () => {
    const ld = buildApartmentComplexJsonLd(BUILDING, UNITS, 'https://ar.example')
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('ApartmentComplex')
    expect(ld.name).toBe('Grass Lake Manor Apartments')
    expect(ld.url).toBe('https://ar.example/buildings/grass-lake-manor')
    expect(ld.telephone).toBe('(612) 478-1122')
    expect(ld.email).toBe('grasslakemanorapts@yahoo.com')
    expect(ld.address.postalCode).toBe('55423')
  })

  it('includes a containsPlace entry per unit', () => {
    const ld = buildApartmentComplexJsonLd(BUILDING, UNITS, 'https://ar.example')
    expect(ld.containsPlace).toHaveLength(2)
    expect(ld.containsPlace[0]!.name).toBe('Unit S1')
    expect(ld.containsPlace[0]!.url).toBe('https://ar.example/units/aaaa0000-0000-0000-0000-000000000000')
    expect(ld.containsPlace[1]!.offers.availabilityStarts).toBeUndefined()
  })

  it('includes amenityFeature entries', () => {
    const ld = buildApartmentComplexJsonLd(BUILDING, UNITS)
    expect(ld.amenityFeature).toHaveLength(2)
    expect(ld.amenityFeature![0]).toEqual({
      '@type': 'LocationFeatureSpecification',
      name: 'On-site laundry',
      value: true,
    })
  })

  it('numberOfRooms reflects unit count', () => {
    const ld = buildApartmentComplexJsonLd(BUILDING, UNITS)
    expect(ld.numberOfRooms).toBe(2)
  })

  it('truncates long descriptions to ~320 chars', () => {
    const long = 'x'.repeat(500)
    const ld = buildApartmentComplexJsonLd(
      { ...BUILDING, description_md: long },
      UNITS,
    )
    expect(ld.description!.length).toBeLessThanOrEqual(320)
    expect(ld.description!.endsWith('…')).toBe(true)
  })

  it('omits optional fields when missing', () => {
    const ld = buildApartmentComplexJsonLd(
      {
        ...BUILDING,
        description_md: undefined,
        contact_phone: null,
        contact_email: null,
        amenities: [],
      },
      [],
    )
    expect(ld.description).toBeUndefined()
    expect(ld.telephone).toBeUndefined()
    expect(ld.email).toBeUndefined()
    expect(ld.amenityFeature).toBeUndefined()
    expect(ld.numberOfRooms).toBeUndefined()
    expect(ld.containsPlace).toEqual([])
  })
})
