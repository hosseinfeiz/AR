insert into storage.buckets (id, name, public)
values
  ('public-photos', 'public-photos', true),
  ('maintenance-uploads', 'maintenance-uploads', false)
on conflict (id) do nothing;

-- public-photos policies: anon read, authenticated write
create policy "public-photos read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'public-photos');

create policy "public-photos write"
on storage.objects for insert
to authenticated
with check (bucket_id = 'public-photos');

create policy "public-photos update"
on storage.objects for update
to authenticated
using (bucket_id = 'public-photos');

create policy "public-photos delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'public-photos');

-- maintenance-uploads policies: writes via signed URLs only (Edge Function);
-- direct anon writes are blocked. Authenticated managers may read.
create policy "maintenance-uploads read"
on storage.objects for select
to authenticated
using (bucket_id = 'maintenance-uploads');
