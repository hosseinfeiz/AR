-- Seed two buildings (deterministic UUIDs for stable references)
insert into public.buildings (
  id, slug, name, address_line1, city, state, postal_code,
  description_md, neighborhood_md, amenities, is_published,
  seo_title, seo_description
) values
(
  '11111111-1111-1111-1111-111111111111',
  'grass-lake-manor',
  'Grass Lake Manor Apartments',
  '__ADDRESS_TBD__',
  '__CITY__',
  'MI',
  '__ZIP__',
  'Grass Lake Manor offers comfortable apartment living in a quiet residential setting.',
  'Walkable neighborhood with parks, schools, and local shops nearby.',
  array['parking','laundry on site','pet friendly'],
  true,
  'Grass Lake Manor Apartments — Apartments for Rent',
  'Comfortable apartments at Grass Lake Manor. Browse available units, schedule a showing, or submit a maintenance request.'
),
(
  '22222222-2222-2222-2222-222222222222',
  'winnetka-manor',
  'Winnetka Manor Apartments',
  '__ADDRESS_TBD__',
  '__CITY__',
  'IL',
  '__ZIP__',
  'Winnetka Manor combines classic apartment charm with modern conveniences.',
  'Close to public transit, restaurants, and green spaces.',
  array['parking','laundry on site','elevator'],
  true,
  'Winnetka Manor Apartments — Apartments for Rent',
  'Apartments at Winnetka Manor. View available units, schedule a tour, or report a maintenance issue.'
)
on conflict (id) do nothing;

-- Seed manager allowlist (replace with real emails before production)
insert into public.managers_allowlist (email, role) values
  ('manager@ar-management.example', 'manager')
on conflict (email) do nothing;
