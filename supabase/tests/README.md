# Supabase RLS smoke tests

These tests verify the row-level-security policies on the AR Management
schema. They run as plain SQL — no JS/TS test runner — so they can be
executed against any Postgres instance with the project's migrations
applied.

## Running locally

From the repo root, with a freshly reset local Supabase:

```bash
supabase db reset
supabase db execute < supabase/tests/rls.spec.sql
```

The script runs inside a single transaction and ends with `rollback;`, so
it does not mutate your local database — every assertion is verified in
isolation, then thrown away.

## What's tested

`rls.spec.sql` covers:

1. **Anonymous reads.** `anon` can `SELECT` a published building but cannot
   see an unpublished one.
2. **Anonymous writes are denied.** `anon` cannot `INSERT` into
   `buildings`.
3. **Authenticated-but-not-on-allowlist.** Conditional on the future
   `is_manager()` helper landing (migration
   `20260520000300_tenant_data_model.sql`), a random authenticated user
   cannot `INSERT` into protected tables. Until then, this case is
   reported as `skip`.
4. **Authenticated-and-on-allowlist.** An authenticated user whose email
   sits in `managers_allowlist` can `INSERT` and `SELECT` against the
   managed tables.
5. **Tenant data model RLS smoke.** For each of
   `tenants / leases / charges / payments / messages` the script checks
   that RLS is enabled, that a non-manager cannot insert, and that a
   manager can read. If any table is missing the script reports `skip`
   for that table and continues.
6. **`is_manager()` helper.** Returns true for an allowlisted JWT email
   and false otherwise. Reported as `skip` until the helper is added.

## Output

You should see a stream of `NOTICE: ok - <label>` lines from `psql` and a
final `ROLLBACK`. Any `RLS TEST FAILED: <label>` line aborts the script
with a non-zero exit code.

## When to extend

Add new policies? Append a `do $$ ... $$;` block (or a pgTAP `select
ok(...)` line if pgTAP is later installed in the project) to
`rls.spec.sql` and keep the file the single source of truth for
RLS-policy smoke coverage.
