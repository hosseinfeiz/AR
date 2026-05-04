create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','booked','blocked')),
  booked_by_request_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index idx_slots_open_future
  on public.availability_slots (building_id, starts_at)
  where status = 'open';

create trigger trg_slots_updated_at
before update on public.availability_slots
for each row execute function public.set_updated_at();
