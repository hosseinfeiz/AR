create table public.units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  unit_number text not null check (length(unit_number) between 1 and 32),
  bedrooms smallint not null check (bedrooms between 0 and 10),
  bathrooms numeric(3,1) not null check (bathrooms between 0 and 10),
  sqft integer check (sqft > 0),
  monthly_rent_cents integer not null check (monthly_rent_cents > 0),
  deposit_cents integer check (deposit_cents >= 0),
  available_from date,
  status text not null check (status in ('available','leased','coming_soon','off_market')),
  floor_plan_path text,
  description_md text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, unit_number)
);

create index idx_units_building_status on public.units (building_id, status);
create index idx_units_available_listing on public.units (status, monthly_rent_cents) where status in ('available','coming_soon');

create trigger trg_units_updated_at
before update on public.units
for each row execute function public.set_updated_at();
