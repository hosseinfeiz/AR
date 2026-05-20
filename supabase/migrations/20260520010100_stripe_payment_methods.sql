-- Stripe payment methods registered for tenants (S1)
-- Depends on:
--   - public.tenants (F1: 20260520000200_tenants.sql or equivalent)
--   - public.is_manager() (F1: managers_allowlist helpers)
--   - public.write_audit() (20260503001200_triggers.sql)
--
-- A tenant_payment_methods row represents a Stripe PaymentMethod (e.g. an ACH
-- bank account) that has been collected via SetupIntent and may be charged
-- later for rent. We also pin the Stripe Customer here so subsequent
-- PaymentIntents can be created server-side without re-looking-up the
-- customer.

create table if not exists public.tenant_payment_methods (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null,
  stripe_customer_id         text not null,
  stripe_payment_method_id   text not null,
  last4                      text,
  brand                      text,            -- for cards; null for ACH
  bank_name                  text,            -- for ACH; null for cards
  type                       text not null default 'us_bank_account',
                              -- 'us_bank_account' | 'card'
  status                     text not null default 'pending',
                              -- 'pending' | 'active' | 'failed' | 'revoked'
  is_default                 boolean not null default false,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint tenant_payment_methods_pm_unique
    unique (stripe_payment_method_id)
);

create index if not exists idx_tenant_payment_methods_tenant
  on public.tenant_payment_methods (tenant_id);

create index if not exists idx_tenant_payment_methods_customer
  on public.tenant_payment_methods (stripe_customer_id);

-- Touch updated_at on UPDATE.
create or replace function public.tenant_payment_methods_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_payment_methods_touch on public.tenant_payment_methods;
create trigger trg_tenant_payment_methods_touch
before update on public.tenant_payment_methods
for each row execute function public.tenant_payment_methods_touch();

-- Audit trigger reuses the shared write_audit() definer function from
-- 20260503001200_triggers.sql. This keeps the audit_log shape consistent.
drop trigger if exists trg_audit_tenant_payment_methods on public.tenant_payment_methods;
create trigger trg_audit_tenant_payment_methods
after insert or update or delete on public.tenant_payment_methods
for each row execute function public.write_audit();

-- RLS — managers can do anything; tenants can read their own rows.
alter table public.tenant_payment_methods enable row level security;

create policy "tenant_payment_methods manager all"
  on public.tenant_payment_methods
  for all
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy "tenant_payment_methods owner read"
  on public.tenant_payment_methods
  for select
  to authenticated
  using (
    tenant_id in (
      select t.id from public.tenants t
      where t.user_id = auth.uid()
    )
  );
