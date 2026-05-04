create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$' and length(slug) between 1 and 64),
  name text not null check (length(name) between 1 and 120),
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null check (length(state) = 2),
  postal_code text not null,
  country text not null default 'US' check (length(country) = 2),
  lat numeric(9,6),
  lng numeric(9,6),
  description_md text not null default '',
  neighborhood_md text not null default '',
  amenities text[] not null default '{}',
  hero_photo_path text,
  contact_phone text,
  contact_email text,
  seo_title text,
  seo_description text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_buildings_updated_at
before update on public.buildings
for each row execute function public.set_updated_at();
