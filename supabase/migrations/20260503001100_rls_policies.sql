-- Enable RLS on every business table
alter table public.buildings              enable row level security;
alter table public.units                   enable row level security;
alter table public.building_photos         enable row level security;
alter table public.unit_photos             enable row level security;
alter table public.availability_slots      enable row level security;
alter table public.showing_requests        enable row level security;
alter table public.maintenance_requests    enable row level security;
alter table public.audit_log               enable row level security;
alter table public.managers_allowlist      enable row level security;

-- buildings
create policy "buildings public read" on public.buildings
  for select to anon, authenticated using (is_published = true);
create policy "buildings manager all" on public.buildings
  for all to authenticated using (true) with check (true);

-- units
create policy "units public read" on public.units
  for select to anon, authenticated using (status in ('available','coming_soon'));
create policy "units manager all" on public.units
  for all to authenticated using (true) with check (true);

-- building_photos / unit_photos
create policy "building_photos public read" on public.building_photos
  for select to anon, authenticated using (true);
create policy "building_photos manager all" on public.building_photos
  for all to authenticated using (true) with check (true);

create policy "unit_photos public read" on public.unit_photos
  for select to anon, authenticated using (true);
create policy "unit_photos manager all" on public.unit_photos
  for all to authenticated using (true) with check (true);

-- availability_slots
create policy "slots public read" on public.availability_slots
  for select to anon, authenticated
  using (status = 'open' and starts_at > now());
create policy "slots manager all" on public.availability_slots
  for all to authenticated using (true) with check (true);

-- showing_requests
create policy "showing public insert" on public.showing_requests
  for insert to anon, authenticated with check (true);
create policy "showing manager read" on public.showing_requests
  for select to authenticated using (true);
create policy "showing manager update" on public.showing_requests
  for update to authenticated using (true) with check (true);

-- maintenance_requests
create policy "maint public insert" on public.maintenance_requests
  for insert to anon, authenticated with check (true);
create policy "maint manager read" on public.maintenance_requests
  for select to authenticated using (true);
create policy "maint manager update" on public.maintenance_requests
  for update to authenticated using (true) with check (true);

-- audit_log: managers can read; writes happen via security-definer trigger
create policy "audit manager read" on public.audit_log
  for select to authenticated using (true);

-- managers_allowlist: managers may read their own membership
create policy "allowlist self read" on public.managers_allowlist
  for select to authenticated
  using (email = auth.jwt()->>'email');
