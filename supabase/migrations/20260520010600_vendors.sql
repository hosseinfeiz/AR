-- S6: Vendor directory + COI tracking + work orders + maintenance SLA + tenant satisfaction surveys.

-- ---------------------------------------------------------------------------
-- is_manager() helper — uses the managers_allowlist table.
-- Defined here (idempotent) so S6 doesn't have to depend on prior migrations
-- having a helper. Other slices may also create this; CREATE OR REPLACE keeps
-- it idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.managers_allowlist
    where email = auth.jwt()->>'email'
  );
$$;

-- ---------------------------------------------------------------------------
-- vendors
-- ---------------------------------------------------------------------------
create type public.vendor_category as enum (
  'plumbing', 'electrical', 'hvac', 'appliance', 'pest', 'locks', 'general'
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category public.vendor_category not null,
  contact_name text,
  email text,
  phone text,
  license_number text,
  insurance_expiry_date date,
  coi_storage_path text,
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  building_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_vendors_active   on public.vendors (active) where deleted_at is null;
create index idx_vendors_category on public.vendors (category) where deleted_at is null;
create index idx_vendors_coi_exp  on public.vendors (insurance_expiry_date);

create trigger trg_vendors_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- work_orders — one per vendor dispatch on a maintenance_request.
-- ---------------------------------------------------------------------------
create type public.work_order_status as enum (
  'quoted', 'scheduled', 'in_progress', 'completed', 'billed'
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id),
  status public.work_order_status not null default 'scheduled',
  assigned_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  notes text,
  photo_paths text[] not null default '{}',
  vendor_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_wo_request on public.work_orders (maintenance_request_id);
create index idx_wo_vendor  on public.work_orders (vendor_id, status);
create index idx_wo_status  on public.work_orders (status, assigned_at desc);

create trigger trg_wo_updated_at
  before update on public.work_orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- maintenance_surveys — tenant satisfaction after resolve.
-- ---------------------------------------------------------------------------
create table public.maintenance_surveys (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text,
  submitted_at timestamptz not null default now(),
  survey_token text unique,
  created_at timestamptz not null default now()
);

create unique index uq_survey_per_request on public.maintenance_surveys (request_id);

-- ---------------------------------------------------------------------------
-- SLA timestamps on maintenance_requests.
-- ---------------------------------------------------------------------------
alter table public.maintenance_requests
  add column if not exists acknowledged_at   timestamptz,
  add column if not exists vendor_assigned_at timestamptz;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.vendors              enable row level security;
alter table public.work_orders          enable row level security;
alter table public.maintenance_surveys  enable row level security;

create policy "vendors manager all" on public.vendors
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy "work_orders manager all" on public.work_orders
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy "surveys manager read" on public.maintenance_surveys
  for select to authenticated
  using (public.is_manager());

-- Survey submissions arrive token-gated (anon) — server-side validation owns auth.
create policy "surveys public insert" on public.maintenance_surveys
  for insert to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- Audit triggers (re-use existing write_audit() function).
-- ---------------------------------------------------------------------------
create trigger trg_audit_vendors
  after insert or update or delete on public.vendors
  for each row execute function public.write_audit();

create trigger trg_audit_work_orders
  after insert or update or delete on public.work_orders
  for each row execute function public.write_audit();

create trigger trg_audit_surveys
  after insert or update or delete on public.maintenance_surveys
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------------
-- vendor-coi storage bucket — private, manager-only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vendor-coi', 'vendor-coi', false)
on conflict (id) do nothing;

create policy "vendor-coi manager read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'vendor-coi' and public.is_manager());

create policy "vendor-coi manager write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'vendor-coi' and public.is_manager());

create policy "vendor-coi manager update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'vendor-coi' and public.is_manager());

create policy "vendor-coi manager delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'vendor-coi' and public.is_manager());
