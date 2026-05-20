-- S4: Showings v2 — live availability picker, Google Calendar sync, reschedule + no-show.
--
-- 1. manager_calendar_connections: per-manager Google OAuth tokens (refresh) + chosen calendar id.
-- 2. extend showing_requests with: reschedule_token_hash, no_show_at. (scheduled_at already exists.)
-- 3. is_manager() helper for RLS, used to gate manager_calendar_connections rows.
--
-- Note: Google refresh tokens are stored as plaintext for now; rotate to a KMS-backed
-- encryption envelope before any real-customer rollout. See runbooks/showings-calendar.md.

create or replace function public.is_manager()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.managers_allowlist a
    where a.email = (auth.jwt() ->> 'email')
  );
$$;

-- manager_id is intentionally NOT a FK to auth.users — the row is keyed by the
-- manager's email (which is on the allowlist). manager_id is a deterministic
-- UUID derived from the email so we can still upsert by primary key. If/when
-- Supabase Auth is wired up, swap this for a real auth.users(id) FK.
create table public.manager_calendar_connections (
  manager_id uuid primary key,
  manager_email text not null references public.managers_allowlist(email) on delete cascade,
  google_refresh_token text not null,
  calendar_id text not null default 'primary',
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_manager_calendar_email on public.manager_calendar_connections (manager_email);

create trigger trg_manager_calendar_updated_at
before update on public.manager_calendar_connections
for each row execute function public.set_updated_at();

alter table public.manager_calendar_connections enable row level security;

create policy "manager_calendar self read" on public.manager_calendar_connections
  for select to authenticated
  using (public.is_manager() and manager_email = (auth.jwt() ->> 'email'));

create policy "manager_calendar self upsert" on public.manager_calendar_connections
  for insert to authenticated
  with check (public.is_manager() and manager_email = (auth.jwt() ->> 'email'));

create policy "manager_calendar self update" on public.manager_calendar_connections
  for update to authenticated
  using (public.is_manager() and manager_email = (auth.jwt() ->> 'email'))
  with check (public.is_manager() and manager_email = (auth.jwt() ->> 'email'));

create policy "manager_calendar self delete" on public.manager_calendar_connections
  for delete to authenticated
  using (public.is_manager() and manager_email = (auth.jwt() ->> 'email'));

-- Extend showing_requests for rescheduling + no-show flagging.
-- scheduled_at already exists in 20260503000600_showing_requests.sql, keep idempotent ADD.
alter table public.showing_requests
  add column if not exists reschedule_token_hash text,
  add column if not exists no_show_at timestamptz;

create index if not exists idx_showings_scheduled_at
  on public.showing_requests (scheduled_at)
  where status = 'scheduled';

create index if not exists idx_showings_reschedule_token_hash
  on public.showing_requests (reschedule_token_hash)
  where reschedule_token_hash is not null;
