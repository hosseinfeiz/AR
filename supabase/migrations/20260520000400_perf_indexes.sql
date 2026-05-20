-- F5 perf hotspots: indexes on join / filter columns flagged by the audit.
-- All statements use IF NOT EXISTS so this is idempotent and safe to re-run.
-- Each index notes the query pattern it accelerates.

-- Manager dashboard / building scoped queries on showings.
create index if not exists idx_showing_building
  on public.showing_requests (building_id);

-- "Showings for a specific unit" lookups (e.g. unit detail / scheduling page).
-- Partial: most showings are slot-only with no unit_id, so we skip those rows.
create index if not exists idx_showing_unit
  on public.showing_requests (unit_id)
  where unit_id is not null;

-- "My open tickets" queries for the assigned manager (manager dashboard).
-- Partial: only filled when an assignment exists (assigned_to is nullable).
create index if not exists idx_maint_assigned_to
  on public.maintenance_requests (assigned_to)
  where assigned_to is not null;

-- Calendar lookups by unit (e.g. unit page showing available tour slots).
create index if not exists idx_slots_unit
  on public.availability_slots (unit_id);

-- "Recent activity by user" audit queries — actor_id with newest-first ordering.
create index if not exists idx_audit_actor
  on public.audit_log (actor_id, created_at desc);
