create table public.showing_requests (
  id uuid primary key default gen_random_uuid(),
  ref_id text not null unique,
  building_id uuid not null references public.buildings(id),
  unit_id uuid references public.units(id),
  slot_id uuid references public.availability_slots(id),
  prospect_name text not null,
  prospect_email text not null,
  prospect_phone text,
  preferred_dates jsonb,
  message text,
  status text not null default 'new' check (status in ('new','scheduled','completed','canceled','no_show')),
  scheduled_at timestamptz,
  manager_notes text,
  source text not null check (source in ('web','ios','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slot_id is not null or (preferred_dates is not null and jsonb_array_length(preferred_dates) >= 1))
);

create index idx_showing_status on public.showing_requests (status, created_at desc);

-- backfill the FK from availability_slots after table exists
alter table public.availability_slots
  add constraint availability_slots_booked_by_fk
  foreign key (booked_by_request_id) references public.showing_requests(id);

create trigger trg_showing_updated_at
before update on public.showing_requests
for each row execute function public.set_updated_at();
