-- push_subscriptions: stores Web Push endpoints per tenant.
--
-- tenant_id is left as text (not a foreign key) because tenant identities in
-- the current MVP live in fixtures (`apps/web/src/lib/tenant-fixtures.ts`),
-- not in a DB-backed table. When tenants land in their own table this can be
-- promoted to a proper foreign key.
--
-- Writes happen exclusively through the service-role API path
-- (apps/web/src/pages/api/portal/push-{subscribe,unsubscribe}.ts); RLS only
-- permits managers to read, and blocks all anon/authenticated writes.

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     text not null,
  endpoint      text not null unique,
  p256dh        text not null,
  auth_token    text not null,
  created_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_tenant_idx
  on public.push_subscriptions (tenant_id);

alter table public.push_subscriptions enable row level security;

-- Managers can read subscriptions to debug delivery / count opt-ins.
-- We mirror the convention used elsewhere ("manager all" = any authenticated
-- session) until is_manager() / manager allowlist enforcement is wired.
create policy "push_subscriptions manager read" on public.push_subscriptions
  for select to authenticated using (true);

-- No anon/authenticated insert/update/delete: tenants subscribe via the
-- service-role-only API route which bypasses RLS.
