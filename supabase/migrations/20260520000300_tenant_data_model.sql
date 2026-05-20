-- F1: Persist the real data model. Until now `tenants`, `leases`, `charges`,
-- `payments`, and `messages` lived only in apps/web/src/lib/*-fixtures.ts.
-- The portal + admin UI already assumes their shape; this migration makes
-- them real. Field shapes mirror the TS interfaces in tenant-fixtures.ts so
-- the data-access layer can be a near-mechanical port.
--
-- All tables include created_at / updated_at / deleted_at for the soft-delete
-- pattern the audit (recommended in the audit) is moving toward.

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  email text not null,
  phone text,
  building_id uuid not null references public.buildings(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  unit_label text not null,
  move_in_date date not null,
  password_sha256 text not null check (length(password_sha256) = 64),
  avatar_initials text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (email)
);

create index idx_tenants_building on public.tenants (building_id) where deleted_at is null;
create index idx_tenants_unit     on public.tenants (unit_id)     where deleted_at is null;
create index idx_tenants_email    on public.tenants (lower(email)) where deleted_at is null;

create trigger trg_tenants_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- leases
-- ---------------------------------------------------------------------------
create table public.leases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  monthly_rent_cents integer not null check (monthly_rent_cents > 0),
  security_deposit_cents integer not null check (security_deposit_cents >= 0),
  status text not null check (status in ('pending','active','ended')),
  -- Reserved for S2/S3 (e-sign + RAG)
  signed_at timestamptz,
  signed_pdf_path text,
  auto_renew boolean not null default false,
  notice_period_days smallint not null default 60 check (notice_period_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date > start_date)
);

create index idx_leases_tenant on public.leases (tenant_id) where deleted_at is null;
create index idx_leases_unit   on public.leases (unit_id)   where deleted_at is null;
create index idx_leases_active on public.leases (status, end_date) where deleted_at is null and status = 'active';

create trigger trg_leases_updated_at
before update on public.leases
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- charges
-- ---------------------------------------------------------------------------
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases(id) on delete restrict,
  -- Denormalized for RLS + reporting speed; must match leases.tenant_id.
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  due_date date not null,
  status text not null check (status in ('due','paid','overdue','waived')),
  -- Filled in by trigger when a payment posts.
  paid_payment_id uuid,
  -- Reserved for S1 (Stripe ACH).
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_charges_tenant_due on public.charges (tenant_id, due_date desc) where deleted_at is null;
create index idx_charges_lease      on public.charges (lease_id) where deleted_at is null;
create index idx_charges_status     on public.charges (status, due_date) where deleted_at is null;

create trigger trg_charges_updated_at
before update on public.charges
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  charge_id uuid not null references public.charges(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  paid_at timestamptz not null default now(),
  method text not null check (method in ('ach','card','cash','check','other')),
  receipt_number text not null,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_number)
);

create index idx_payments_tenant on public.payments (tenant_id, paid_at desc);
create index idx_payments_charge on public.payments (charge_id);

-- Now add the deferred FK on charges.paid_payment_id (forward reference).
alter table public.charges
  add constraint charges_paid_payment_fk
  foreign key (paid_payment_id) references public.payments(id)
  on delete set null;

create trigger trg_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

-- When a payment is inserted, flip the charge to paid + link back.
create or replace function public.apply_payment_to_charge()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.charges
    set status = 'paid',
        paid_payment_id = new.id,
        updated_at = now()
  where id = new.charge_id
    and status in ('due','overdue');
  return new;
end;
$$;

create trigger trg_apply_payment_to_charge
after insert on public.payments
for each row execute function public.apply_payment_to_charge();

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  from_name text not null,
  from_role text not null default 'manager' check (from_role in ('manager','tenant','system')),
  subject text not null,
  body text not null,
  category text not null check (category in ('announcement','lease','payment','maintenance','general')),
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_messages_tenant on public.messages (tenant_id, sent_at desc) where deleted_at is null;
create index idx_messages_unread on public.messages (tenant_id) where deleted_at is null and read_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- All five tables: managers (allowlist) can do anything; service_role bypasses
-- RLS by default; anon has no access. Tenant-self-read policies wait until
-- Supabase Auth is wired up for tenants (currently cookie-based via Astro).

alter table public.tenants  enable row level security;
alter table public.leases   enable row level security;
alter table public.charges  enable row level security;
alter table public.payments enable row level security;
alter table public.messages enable row level security;

create policy "tenants manager all" on public.tenants
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "leases manager all" on public.leases
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "charges manager all" on public.charges
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "payments manager all" on public.payments
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

create policy "messages manager all" on public.messages
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Audit triggers (extend the existing write_audit() from migration 1200)
-- ---------------------------------------------------------------------------
create trigger trg_audit_tenants
after insert or update or delete on public.tenants
for each row execute function public.write_audit();

create trigger trg_audit_leases
after insert or update or delete on public.leases
for each row execute function public.write_audit();

create trigger trg_audit_charges
after insert or update or delete on public.charges
for each row execute function public.write_audit();

create trigger trg_audit_payments
after insert or update or delete on public.payments
for each row execute function public.write_audit();

create trigger trg_audit_messages
after insert or update or delete on public.messages
for each row execute function public.write_audit();
