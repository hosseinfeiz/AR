-- Tighten RLS: replace blanket `using (true)` manager policies with a helper
-- that requires the caller to be on managers_allowlist. Authenticated users
-- who are not managers (e.g. future tenant accounts) must NOT be able to
-- mutate buildings, units, slots, photos, or read all requests.

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

revoke all on function public.is_manager() from public;
grant execute on function public.is_manager() to anon, authenticated;

-- buildings
drop policy if exists "buildings manager all" on public.buildings;
create policy "buildings manager all" on public.buildings
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- units
drop policy if exists "units manager all" on public.units;
create policy "units manager all" on public.units
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- building_photos
drop policy if exists "building_photos manager all" on public.building_photos;
create policy "building_photos manager all" on public.building_photos
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- unit_photos
drop policy if exists "unit_photos manager all" on public.unit_photos;
create policy "unit_photos manager all" on public.unit_photos
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- availability_slots
drop policy if exists "slots manager all" on public.availability_slots;
create policy "slots manager all" on public.availability_slots
  for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- showing_requests: managers (not all authed users) can read + update
drop policy if exists "showing manager read" on public.showing_requests;
create policy "showing manager read" on public.showing_requests
  for select to authenticated using (public.is_manager());

drop policy if exists "showing manager update" on public.showing_requests;
create policy "showing manager update" on public.showing_requests
  for update to authenticated using (public.is_manager()) with check (public.is_manager());

-- maintenance_requests: same
drop policy if exists "maint manager read" on public.maintenance_requests;
create policy "maint manager read" on public.maintenance_requests
  for select to authenticated using (public.is_manager());

drop policy if exists "maint manager update" on public.maintenance_requests;
create policy "maint manager update" on public.maintenance_requests
  for update to authenticated using (public.is_manager()) with check (public.is_manager());

-- audit_log: managers can read
drop policy if exists "audit manager read" on public.audit_log;
create policy "audit manager read" on public.audit_log
  for select to authenticated using (public.is_manager());
