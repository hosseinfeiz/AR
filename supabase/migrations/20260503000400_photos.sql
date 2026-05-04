create table public.building_photos (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  storage_path text not null,
  alt_text text not null check (length(alt_text) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_building_photos_order on public.building_photos (building_id, sort_order);

create table public.unit_photos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  storage_path text not null,
  alt_text text not null check (length(alt_text) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_unit_photos_order on public.unit_photos (unit_id, sort_order);
