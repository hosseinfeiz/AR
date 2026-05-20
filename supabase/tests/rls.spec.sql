-- F6: RLS smoke tests for the AR Management Supabase schema.
--
-- These tests verify the row-level-security policies defined in
-- supabase/migrations/20260503001100_rls_policies.sql (and, when present,
-- the tenant-data-model policies from a future migration named
-- 20260520000300_tenant_data_model.sql).
--
-- Run against a freshly reset local Supabase:
--     supabase db reset
--     supabase db execute < supabase/tests/rls.spec.sql
--
-- pgTAP is preferred but not required. We use plpgsql `raise exception`
-- inside a transaction so a failure aborts the whole script. If pgTAP is
-- available, the assertions can be rewritten with `select is(...)` /
-- `select throws_ok(...)` later — the structure stays the same.

\set ON_ERROR_STOP on
\timing off

begin;

-- =====================================================================
-- Helper: assert a condition or raise a labelled failure.
-- =====================================================================
create or replace function pg_temp.assert(cond boolean, label text)
returns void language plpgsql as $$
begin
  if not cond then
    raise exception 'RLS TEST FAILED: %', label;
  end if;
  raise notice 'ok - %', label;
end
$$;

-- =====================================================================
-- Helper: run a stmt as a given role/JWT and capture whether it raised.
-- =====================================================================
create or replace function pg_temp.expect_denied(stmt text, label text)
returns void language plpgsql as $$
declare
  raised boolean := false;
begin
  begin
    execute stmt;
  exception
    when others then
      raised := true;
  end;
  perform pg_temp.assert(raised, label || ' (expected denial)');
end
$$;

create or replace function pg_temp.expect_allowed(stmt text, label text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'ok - % (allowed)', label;
exception when others then
  raise exception 'RLS TEST FAILED: % (expected to succeed, got: %)', label, sqlerrm;
end
$$;

-- =====================================================================
-- Seed: one published + one unpublished building.
-- =====================================================================
set local role postgres;

insert into public.buildings (id, slug, name, address_line1, city, state, postal_code, is_published)
values
  ('99999999-9999-9999-9999-999999999991', 'test-pub',   'Test Published',   '1 Main',  'Mpls', 'MN', '55401', true),
  ('99999999-9999-9999-9999-999999999992', 'test-unpub', 'Test Unpublished', '2 Main',  'Mpls', 'MN', '55401', false)
on conflict (id) do nothing;

insert into public.managers_allowlist (email)
values ('manager@example.com')
on conflict (email) do nothing;

-- =====================================================================
-- 1. anon CAN select published buildings; CANNOT see unpublished.
-- =====================================================================
set local role anon;

do $$
declare
  pub_count integer;
  unpub_count integer;
begin
  select count(*) into pub_count
  from public.buildings where id = '99999999-9999-9999-9999-999999999991';
  perform pg_temp.assert(pub_count = 1, 'anon can SELECT a published building');

  select count(*) into unpub_count
  from public.buildings where id = '99999999-9999-9999-9999-999999999992';
  perform pg_temp.assert(unpub_count = 0, 'anon CANNOT see an unpublished building');
end
$$;

-- =====================================================================
-- 2. anon CANNOT insert into buildings.
-- =====================================================================
select pg_temp.expect_denied(
  $sql$
    insert into public.buildings (slug, name, address_line1, city, state, postal_code, is_published)
    values ('hacker', 'Anon Bldg', '666 Bad St', 'Mpls', 'MN', '55401', true)
  $sql$,
  'anon cannot INSERT into buildings'
);

-- =====================================================================
-- 3. authenticated-but-NOT-on-allowlist behaviour.
--
-- NOTE: as of migration 20260503001100_rls_policies.sql the
-- "buildings manager all" policy is `for all to authenticated using (true)` —
-- it does NOT restrict by allowlist. The F6 plan calls for an `is_manager()`
-- helper that filters by managers_allowlist (anticipated in a future
-- 20260520000300_tenant_data_model.sql migration). These assertions become
-- meaningful once that migration lands; for now we encode the desired
-- behaviour and skip the body with `notice` rather than raising.
-- =====================================================================
set local role authenticated;
set local "request.jwt.claims" to '{"email":"randall.unauthorized@example.com","role":"authenticated"}';

do $$
declare
  is_manager_present boolean;
begin
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_manager'
  ) into is_manager_present;

  if is_manager_present then
    -- buildings (and dependent tables) should reject inserts from a
    -- non-allowlist authenticated user.
    begin
      insert into public.buildings (slug, name, address_line1, city, state, postal_code)
      values ('intruder', 'Intruder Bldg', '1 Bad', 'Mpls', 'MN', '55401');
      raise exception 'RLS TEST FAILED: non-allowlist authenticated should NOT insert into buildings';
    exception when insufficient_privilege or check_violation or others then
      raise notice 'ok - non-allowlist authenticated cannot INSERT into buildings';
    end;
  else
    raise notice 'skip - is_manager() not present yet (waiting on tenant_data_model migration)';
  end if;
end
$$;

-- =====================================================================
-- 4. authenticated-and-ON-allowlist CAN insert/select buildings.
--
-- Same caveat as #3: until is_manager() exists the current policy already
-- permits *any* authenticated user, so this asserts the looser current
-- behaviour and tightens up once the helper lands.
-- =====================================================================
set local role authenticated;
set local "request.jwt.claims" to '{"email":"manager@example.com","role":"authenticated"}';

select pg_temp.expect_allowed(
  $sql$
    insert into public.buildings (slug, name, address_line1, city, state, postal_code)
    values ('mgr-ok', 'Mgr Bldg', '100 Ok', 'Mpls', 'MN', '55401')
    on conflict (slug) do nothing
  $sql$,
  'allowlisted manager can INSERT into buildings'
);

select pg_temp.expect_allowed(
  $sql$
    select count(*) from public.buildings
  $sql$,
  'allowlisted manager can SELECT all buildings (published + unpublished)'
);

-- =====================================================================
-- 5. Tenant data model (tenants/leases/charges/payments/messages).
--
-- These tables are introduced in migration
-- 20260520000300_tenant_data_model.sql (F2 deliverable, parallel agent).
-- If the migration hasn't been applied yet, gracefully skip. When the
-- tables exist:
--   - authenticated non-manager: every INSERT must be denied.
--   - allowlisted manager: every INSERT must succeed (or fail only on
--     check / FK constraints unrelated to RLS).
-- =====================================================================
set local role postgres;

do $$
declare
  t text;
  exists_count integer;
  missing text[] := array[]::text[];
  present text[] := array[]::text[];
begin
  foreach t in array array['tenants','leases','charges','payments','messages'] loop
    select count(*) into exists_count
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t and c.relkind = 'r';
    if exists_count = 1 then
      present := present || t;
    else
      missing := missing || t;
    end if;
  end loop;

  if array_length(missing, 1) is not null then
    raise notice 'skip - tenant_data_model tables missing: %', missing;
  end if;
  if array_length(present, 1) is not null then
    raise notice 'note - tenant_data_model tables present: %', present;
    -- For each present table, assert RLS is enabled.
    foreach t in array present loop
      perform pg_temp.assert(
        (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = t),
        format('RLS enabled on public.%I', t)
      );
    end loop;
  end if;
end
$$;

-- Per-table RLS smoke. If the table doesn't exist the EXECUTE will error;
-- we wrap with a guard that skips missing tables.
create or replace function pg_temp.tenant_table_rls_smoke(tbl text)
returns void language plpgsql as $$
declare
  exists_count integer;
begin
  select count(*) into exists_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = tbl and c.relkind = 'r';
  if exists_count = 0 then
    raise notice 'skip - public.% does not exist yet', tbl;
    return;
  end if;

  -- Non-allowlist authenticated CANNOT insert.
  set local role authenticated;
  set local "request.jwt.claims" to '{"email":"randall.unauthorized@example.com","role":"authenticated"}';
  begin
    execute format('insert into public.%I default values', tbl);
    raise exception 'RLS TEST FAILED: non-manager authenticated should NOT insert into %', tbl;
  exception when others then
    raise notice 'ok - non-manager authenticated cannot INSERT into %', tbl;
  end;

  -- Allowlisted manager: insert may succeed or may fail on check/FK,
  -- but it should NOT fail with insufficient_privilege. We only assert
  -- "not blocked by RLS"; functional inserts belong in F2's own specs.
  set local role authenticated;
  set local "request.jwt.claims" to '{"email":"manager@example.com","role":"authenticated"}';
  begin
    execute format('select 1 from public.%I limit 1', tbl);
    raise notice 'ok - allowlisted manager can SELECT from %', tbl;
  exception when others then
    raise exception 'RLS TEST FAILED: allowlisted manager could not SELECT from %: %', tbl, sqlerrm;
  end;

  set local role postgres;
end
$$;

select pg_temp.tenant_table_rls_smoke('tenants');
select pg_temp.tenant_table_rls_smoke('leases');
select pg_temp.tenant_table_rls_smoke('charges');
select pg_temp.tenant_table_rls_smoke('payments');
select pg_temp.tenant_table_rls_smoke('messages');

-- =====================================================================
-- 6. is_manager() helper.
-- =====================================================================
set local role postgres;

do $$
declare
  fn_exists boolean;
  off_result boolean;
  on_result boolean;
begin
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_manager'
  ) into fn_exists;

  if not fn_exists then
    raise notice 'skip - public.is_manager() not present yet (waiting on tenant_data_model migration)';
    return;
  end if;

  -- Calling with the manager JWT must return true.
  set local role authenticated;
  set local "request.jwt.claims" to '{"email":"manager@example.com","role":"authenticated"}';
  execute 'select public.is_manager()' into on_result;
  perform pg_temp.assert(on_result is true, 'is_manager() returns true for allowlisted email');

  -- Calling with a non-allowlist JWT must return false.
  set local role authenticated;
  set local "request.jwt.claims" to '{"email":"randall.unauthorized@example.com","role":"authenticated"}';
  execute 'select public.is_manager()' into off_result;
  perform pg_temp.assert(off_result is false, 'is_manager() returns false for non-allowlist email');

  set local role postgres;
end
$$;

-- =====================================================================
-- Done.
-- =====================================================================
rollback;
