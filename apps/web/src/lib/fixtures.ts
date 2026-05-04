// Fixture data used in dev mock mode (when PUBLIC_SUPABASE_URL is not configured).
// Mirrors the shape of supabase rows used by pages/components.

export interface FixtureBuilding {
  id: string
  slug: string
  name: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  description_md: string
  neighborhood_md: string
  amenities: string[]
  contact_phone: string | null
  contact_email: string | null
  seo_title: string | null
  seo_description: string | null
  is_published: boolean
  building_photos?: { storage_path: string; alt_text: string; sort_order: number }[]
}

export interface FixtureUnit {
  id: string
  building_id: string
  unit_number: string
  bedrooms: number
  bathrooms: number
  sqft: number | null
  monthly_rent_cents: number
  available_from: string | null
  status: 'available' | 'leased' | 'coming_soon' | 'off_market'
  description_md: string
  unit_photos?: { storage_path: string; alt_text: string; sort_order: number }[]
  building?: FixtureBuilding
}

export const buildings: FixtureBuilding[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'grass-lake-manor',
    name: 'Grass Lake Manor Apartments',
    address_line1: '928 Rae Drive',
    address_line2: null,
    city: 'Richfield',
    state: 'MN',
    postal_code: '55423',
    country: 'US',
    description_md:
      'Grass Lake Manor offers comfortable apartment living in a quiet residential pocket of Richfield. Spacious floor plans, on-site laundry, and dedicated parking. Pet-friendly and minutes from the lakes, parks, and downtown Minneapolis.',
    neighborhood_md:
      'A residential block bordered by Wood Lake Nature Center, Augsburg Park, and the Diamond Lake area. Easy access to I-35W, MSP airport, and the light rail. Walkable to grocery stores, restaurants on Penn Avenue, and the Richfield High School campus.',
    amenities: ['Off-street parking', 'On-site laundry', 'Pet friendly', 'Heat included', 'Storage units'],
    contact_phone: '(612) 555-0142',
    contact_email: 'grasslake@ar-management.example',
    seo_title: 'Grass Lake Manor Apartments — Apartments for Rent in Richfield, MN',
    seo_description:
      'Comfortable apartments at Grass Lake Manor in Richfield, MN. Browse available units, schedule a showing, or submit a maintenance request.',
    is_published: true,
    building_photos: [
      { storage_path: '/buildings/grass-lake-manor.png', alt_text: 'Front exterior of Grass Lake Manor Apartments at 928 Rae Drive, Richfield', sort_order: 0 },
    ],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    slug: 'winnetka-manor',
    name: 'Winnetka Manor Apartments',
    address_line1: '4521 Winnetka Avenue North',
    address_line2: null,
    city: 'New Hope',
    state: 'MN',
    postal_code: '55428',
    country: 'US',
    description_md:
      'Winnetka Manor combines classic apartment charm with modern conveniences in the heart of New Hope. Restored hardwood floors, updated kitchens, and an elevator-served lobby on a quiet residential block.',
    neighborhood_md:
      'Walkable to the New Hope City Center, Northwood Park, and the Northwest YMCA. Close to bus routes serving downtown Minneapolis and easy access to Highway 169.',
    amenities: ['Elevator', 'On-site laundry', 'Off-street parking', 'Hardwood floors', 'Storage'],
    contact_phone: '(763) 555-0188',
    contact_email: 'winnetka@ar-management.example',
    seo_title: 'Winnetka Manor Apartments — Apartments for Rent in New Hope, MN',
    seo_description:
      'Apartments at Winnetka Manor in New Hope, MN. View available units, schedule a tour, or report a maintenance issue.',
    is_published: true,
    building_photos: [
      { storage_path: '/buildings/winnetka-manor.png', alt_text: 'Front exterior of Winnetka Manor Apartments at 4521 Winnetka Avenue N, New Hope', sort_order: 0 },
    ],
  },
]

export const units: FixtureUnit[] = [
  {
    id: 'aaaa1111-1111-1111-1111-111111111111',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_number: '2A',
    bedrooms: 1,
    bathrooms: 1,
    sqft: 720,
    monthly_rent_cents: 109500,
    available_from: '2026-06-01',
    status: 'available',
    description_md:
      'Bright corner one-bedroom on the second floor with east- and south-facing windows. Updated kitchen with new appliances; full bath; large closet.',
    unit_photos: [],
  },
  {
    id: 'aaaa2222-2222-2222-2222-222222222222',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_number: '3B',
    bedrooms: 2,
    bathrooms: 1.5,
    sqft: 980,
    monthly_rent_cents: 142500,
    available_from: '2026-07-15',
    status: 'available',
    description_md:
      'Spacious two-bedroom on the third floor with in-unit washer/dryer hookup, walk-in closet in primary bedroom, and a renovated bathroom.',
    unit_photos: [],
  },
  {
    id: 'bbbb1111-1111-1111-1111-111111111111',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_number: '1C',
    bedrooms: 0,
    bathrooms: 1,
    sqft: 480,
    monthly_rent_cents: 132500,
    available_from: '2026-06-15',
    status: 'available',
    description_md:
      'First-floor studio with original hardwood floors, large windows facing the courtyard, and an updated galley kitchen. Quiet, ideal for a single resident.',
    unit_photos: [],
  },
  {
    id: 'bbbb2222-2222-2222-2222-222222222222',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_number: '4A',
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1120,
    monthly_rent_cents: 225000,
    available_from: '2026-08-01',
    status: 'coming_soon',
    description_md:
      'Top-floor two-bedroom with two full baths, a private balcony, and a renovated open kitchen. Coming available August.',
    unit_photos: [],
  },
]

export function isMockMode(): boolean {
  const url = import.meta.env.PUBLIC_SUPABASE_URL
  return !url || url.includes('placeholder')
}
