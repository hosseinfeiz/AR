create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  ref_id text not null unique,
  building_id uuid not null references public.buildings(id),
  unit_number text not null,
  tenant_name text not null,
  tenant_email text,
  tenant_phone text,
  issue_type text not null check (issue_type in ('plumbing','electrical','hvac','appliance','pest','locks','other')),
  urgency text not null check (urgency in ('low','normal','high','emergency')),
  description text not null,
  photo_paths text[] not null default '{}',
  status text not null default 'new' check (status in ('new','acknowledged','in_progress','resolved','closed')),
  assigned_to uuid references auth.users(id),
  manager_notes text,
  source text not null check (source in ('web','ios','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tenant_email is not null or tenant_phone is not null),
  check (array_length(photo_paths, 1) is null or array_length(photo_paths, 1) <= 5)
);

create index idx_maint_status on public.maintenance_requests (status, urgency, created_at desc);
create index idx_maint_building on public.maintenance_requests (building_id, status);

create trigger trg_maint_updated_at
before update on public.maintenance_requests
for each row execute function public.set_updated_at();
