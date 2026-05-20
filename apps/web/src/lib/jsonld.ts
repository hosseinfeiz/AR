// Schema.org JSON-LD builders for buildings and units.
//
// Used by the building detail page to emit `ApartmentComplex` structured
// data containing nested `Apartment` entries for each contained unit, and by
// the unit detail page to emit a standalone `Apartment` entry.
//
// Helpers are pure: they take plain data and return plain objects ready for
// `JSON.stringify()`. Tests live in `tests/unit/jsonld.test.ts`.

export interface JsonLdAddress {
  address_line1: string
  address_line2?: string | null
  city: string
  state: string
  postal_code: string
  country: string
}

export interface JsonLdUnit {
  id: string
  unit_number: string
  bedrooms: number
  bathrooms: number
  sqft: number | null
  monthly_rent_cents: number
  available_from: string | null
}

export interface JsonLdBuilding extends JsonLdAddress {
  name: string
  slug: string
  description_md?: string
  amenities?: string[]
  contact_phone?: string | null
  contact_email?: string | null
  url?: string
}

export interface PostalAddress {
  '@type': 'PostalAddress'
  streetAddress: string
  addressLocality: string
  addressRegion: string
  postalCode: string
  addressCountry: string
}

export function postalAddress(b: JsonLdAddress): PostalAddress {
  const street = b.address_line2 ? `${b.address_line1}, ${b.address_line2}` : b.address_line1
  return {
    '@type': 'PostalAddress',
    streetAddress: street,
    addressLocality: b.city,
    addressRegion: b.state,
    postalCode: b.postal_code,
    addressCountry: b.country,
  }
}

export interface ApartmentJsonLd {
  '@context': 'https://schema.org'
  '@type': 'Apartment'
  name: string
  address: PostalAddress
  numberOfRooms: number
  numberOfBathroomsTotal: number
  floorSize?: { '@type': 'QuantitativeValue'; value: number; unitCode: 'FTK' }
  offers: {
    '@type': 'Offer'
    price: string
    priceCurrency: 'USD'
    availability: 'https://schema.org/InStock'
    availabilityStarts?: string
    url?: string
  }
  url?: string
}

export function buildApartmentJsonLd(
  unit: JsonLdUnit,
  building: JsonLdBuilding,
  unitUrl?: string,
): ApartmentJsonLd {
  const price = (unit.monthly_rent_cents / 100).toFixed(2)
  const out: ApartmentJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Apartment',
    name: `Unit ${unit.unit_number} at ${building.name}`,
    address: postalAddress(building),
    numberOfRooms: unit.bedrooms,
    numberOfBathroomsTotal: unit.bathrooms,
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      ...(unit.available_from && { availabilityStarts: unit.available_from }),
      ...(unitUrl && { url: unitUrl }),
    },
    ...(unitUrl && { url: unitUrl }),
  }
  if (unit.sqft) {
    out.floorSize = { '@type': 'QuantitativeValue', value: unit.sqft, unitCode: 'FTK' }
  }
  return out
}

// `containsPlace` entries are simple Apartment nodes — no `@context` (it's
// nested) and they reference the same address as the parent complex.
export interface ContainedApartment {
  '@type': 'Apartment'
  name: string
  numberOfRooms: number
  numberOfBathroomsTotal: number
  floorSize?: { '@type': 'QuantitativeValue'; value: number; unitCode: 'FTK' }
  offers: {
    '@type': 'Offer'
    price: string
    priceCurrency: 'USD'
    availability: 'https://schema.org/InStock'
    availabilityStarts?: string
    url?: string
  }
  url?: string
}

function buildContainedApartment(
  unit: JsonLdUnit,
  building: JsonLdBuilding,
  baseUrl?: string,
): ContainedApartment {
  const price = (unit.monthly_rent_cents / 100).toFixed(2)
  const url = baseUrl ? `${baseUrl}/units/${unit.id}` : undefined
  const out: ContainedApartment = {
    '@type': 'Apartment',
    name: `Unit ${unit.unit_number}`,
    numberOfRooms: unit.bedrooms,
    numberOfBathroomsTotal: unit.bathrooms,
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      ...(unit.available_from && { availabilityStarts: unit.available_from }),
      ...(url && { url }),
    },
    ...(url && { url }),
  }
  if (unit.sqft) {
    out.floorSize = { '@type': 'QuantitativeValue', value: unit.sqft, unitCode: 'FTK' }
  }
  // void building param so the signature stays building-aware for future use
  void building
  return out
}

export interface ApartmentComplexJsonLd {
  '@context': 'https://schema.org'
  '@type': 'ApartmentComplex'
  name: string
  url?: string
  description?: string
  address: PostalAddress
  telephone?: string
  email?: string
  numberOfRooms?: number
  amenityFeature?: { '@type': 'LocationFeatureSpecification'; name: string; value: true }[]
  containsPlace: ContainedApartment[]
}

export function buildApartmentComplexJsonLd(
  building: JsonLdBuilding,
  units: JsonLdUnit[],
  baseUrl?: string,
): ApartmentComplexJsonLd {
  const out: ApartmentComplexJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ApartmentComplex',
    name: building.name,
    address: postalAddress(building),
    containsPlace: units.map((u) => buildContainedApartment(u, building, baseUrl)),
  }
  const buildingUrl = baseUrl ? `${baseUrl}/buildings/${building.slug}` : building.url
  if (buildingUrl) out.url = buildingUrl
  if (building.description_md) {
    // Truncate to a reasonable description length (first paragraph or 320 chars).
    const para = building.description_md.split('\n\n')[0] ?? building.description_md
    out.description = para.length > 320 ? para.slice(0, 317) + '…' : para
  }
  if (building.contact_phone) out.telephone = building.contact_phone
  if (building.contact_email) out.email = building.contact_email
  // numberOfRooms on an ApartmentComplex = total number of rentable rooms across
  // contained units. Use unit count for a conservative interpretation.
  if (units.length > 0) out.numberOfRooms = units.length
  if (building.amenities && building.amenities.length > 0) {
    out.amenityFeature = building.amenities.map((a) => ({
      '@type': 'LocationFeatureSpecification',
      name: a,
      value: true,
    }))
  }
  return out
}
