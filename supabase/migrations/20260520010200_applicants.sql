-- Applicants pipeline (S2)
-- Inquiry → Application → Screening → Lease-Ready → Signed (or Withdrawn)
--
-- The screening / e-sign integrations land in code as stubs that env-gate to
-- live providers (TransUnion SmartMove, Dropbox Sign) when API keys are set;
-- columns below hold the provider's references so the dashboard can deep-link.

create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),

  -- Contact
  name        text not null,
  email       text not null,
  phone       text,

  -- Target property
  building_id    uuid not null references public.buildings(id),
  unit_id        uuid references public.units(id),
  move_in_date   date,

  -- Financials
  monthly_income_cents bigint,

  -- Pipeline status
  status text not null default 'inquiry'
    check (status in ('inquiry','application','screening','lease_ready','signed','withdrawn')),

  -- Provider refs
  screening_provider_ref     text,
  screening_score            integer,
  screening_recommendation   text check (
    screening_recommendation is null
    or screening_recommendation in ('accept','review','decline')
  ),
  esign_envelope_id          text,

  -- Lifecycle
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_applicants_status_created
  on public.applicants (status, created_at desc);

create index if not exists idx_applicants_building_status
  on public.applicants (building_id, status);

-- updated_at trigger (function defined in 20260503000100_init.sql)
drop trigger if exists trg_applicants_updated_at on public.applicants;
create trigger trg_applicants_updated_at
before update on public.applicants
for each row execute function public.set_updated_at();

-- Audit trigger (function defined in 20260503001200_triggers.sql)
drop trigger if exists trg_audit_applicants on public.applicants;
create trigger trg_audit_applicants
after insert or update or delete on public.applicants
for each row execute function public.write_audit();

-- ----------------------------------------------------------------------------
-- Manager helper: is_manager()
-- The schema's existing RLS policies use `to authenticated` directly. We add
-- a stable helper that policies (here + future) can use as canonical gate.
-- A user is a manager iff their JWT email is on the managers_allowlist.
-- ----------------------------------------------------------------------------
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.managers_allowlist a
    where a.email = (auth.jwt() ->> 'email')
  );
$$;

-- RLS — only managers may touch applicant rows.
alter table public.applicants enable row level security;

create policy "applicants manager read"
  on public.applicants
  for select
  to authenticated
  using (public.is_manager());

create policy "applicants manager insert"
  on public.applicants
  for insert
  to authenticated
  with check (public.is_manager());

create policy "applicants manager update"
  on public.applicants
  for update
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy "applicants manager delete"
  on public.applicants
  for delete
  to authenticated
  using (public.is_manager());

-- ----------------------------------------------------------------------------
-- Storage bucket: leases  (signed PDFs land here)
-- Idempotent — F1 may or may not have created it.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('leases', 'leases', false)
on conflict (id) do nothing;

-- Authenticated managers can read/write the leases bucket.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'leases read'
  ) then
    create policy "leases read"
      on storage.objects for select
      to authenticated
      using (bucket_id = 'leases');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'leases write'
  ) then
    create policy "leases write"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'leases');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'leases update'
  ) then
    create policy "leases update"
      on storage.objects for update
      to authenticated
      using (bucket_id = 'leases');
  end if;
end$$;
