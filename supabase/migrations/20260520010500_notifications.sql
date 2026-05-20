-- S5: Manager preferences, in-app notifications, email events
-- Adds:
--   - is_manager() helper (jwt email present in managers_allowlist)
--   - manager_preferences  (per-manager quiet hours, batching, filters)
--   - notifications        (in-app notification center + delivery queue)
--   - email_events         (Resend webhook ingestion)

-- ---------------------------------------------------------------------------
-- is_manager() helper
-- Used by RLS policies in this migration. Reads the email from auth.jwt() and
-- checks membership in managers_allowlist.
-- ---------------------------------------------------------------------------
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.managers_allowlist
    where email = (auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.is_manager() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- manager_preferences
-- One row per manager. PK is the manager's email, FK to managers_allowlist.
-- ---------------------------------------------------------------------------
create table public.manager_preferences (
  manager_email      text primary key references public.managers_allowlist(email) on delete cascade,
  quiet_hours_start  time,
  quiet_hours_end    time,
  batch_after_count  smallint not null default 1 check (batch_after_count between 1 and 50),
  filters            jsonb    not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);

create or replace function public.touch_manager_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_touch_manager_preferences
  before update on public.manager_preferences
  for each row execute function public.touch_manager_preferences_updated_at();

-- ---------------------------------------------------------------------------
-- notifications
-- In-app notification center, also acts as the queue for batched email
-- delivery. sent_at = null means "still queued for delivery". read_at tracks
-- whether the manager has acknowledged it in the inbox UI.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  kind            text not null check (kind in (
    'maintenance_request',
    'showing_request',
    'digest',
    'system'
  )),
  payload         jsonb not null default '{}'::jsonb,
  sent_at         timestamptz,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_email, created_at desc);

create index notifications_unsent_idx
  on public.notifications (recipient_email, created_at)
  where sent_at is null;

-- ---------------------------------------------------------------------------
-- email_events
-- Resend webhook events for delivery monitoring. One row per provider event.
-- ---------------------------------------------------------------------------
create table public.email_events (
  id                  uuid primary key default gen_random_uuid(),
  provider_message_id text,
  kind                text not null check (kind in (
    'delivered', 'bounced', 'complaint', 'opened', 'clicked', 'sent', 'delivery_delayed', 'failed'
  )),
  raw                 jsonb not null default '{}'::jsonb,
  received_at         timestamptz not null default now()
);

create index email_events_message_id_idx
  on public.email_events (provider_message_id);

create index email_events_received_at_idx
  on public.email_events (received_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.manager_preferences enable row level security;
alter table public.notifications       enable row level security;
alter table public.email_events        enable row level security;

-- manager_preferences: a manager may read & write their own row only.
create policy "manager_preferences self read"
  on public.manager_preferences
  for select to authenticated
  using (public.is_manager() and manager_email = (auth.jwt() ->> 'email'));

create policy "manager_preferences self upsert"
  on public.manager_preferences
  for insert to authenticated
  with check (public.is_manager() and manager_email = (auth.jwt() ->> 'email'));

create policy "manager_preferences self update"
  on public.manager_preferences
  for update to authenticated
  using (public.is_manager() and manager_email = (auth.jwt() ->> 'email'))
  with check (public.is_manager() and manager_email = (auth.jwt() ->> 'email'));

-- notifications: managers see and mark-read their own notifications.
create policy "notifications self read"
  on public.notifications
  for select to authenticated
  using (public.is_manager() and recipient_email = (auth.jwt() ->> 'email'));

create policy "notifications self update"
  on public.notifications
  for update to authenticated
  using (public.is_manager() and recipient_email = (auth.jwt() ->> 'email'))
  with check (public.is_manager() and recipient_email = (auth.jwt() ->> 'email'));

-- email_events: managers can read for monitoring. Writes happen via service
-- role from the Resend webhook handler.
create policy "email_events manager read"
  on public.email_events
  for select to authenticated
  using (public.is_manager());
