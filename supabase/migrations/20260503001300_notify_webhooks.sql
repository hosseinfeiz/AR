-- Use pg_net to POST to the Edge Function on insert
create or replace function public.notify_on_new_request()
returns trigger
language plpgsql
security definer
as $$
declare
  v_url text := current_setting('app.edge_functions_url', true) || '/notify-on-new-request';
  v_anon text := current_setting('app.anon_key', true);
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

create trigger trg_notify_on_showing
after insert on public.showing_requests
for each row execute function public.notify_on_new_request();

create trigger trg_notify_on_maintenance
after insert on public.maintenance_requests
for each row execute function public.notify_on_new_request();

-- ref_id auto-generation
create or replace function public.set_ref_id()
returns trigger
language plpgsql
as $$
begin
  if new.ref_id is null or new.ref_id = '' then
    new.ref_id := upper(substring(md5(gen_random_uuid()::text || now()::text) for 8));
  end if;
  return new;
end;
$$;

create trigger trg_set_ref_id_showing
before insert on public.showing_requests
for each row execute function public.set_ref_id();

create trigger trg_set_ref_id_maint
before insert on public.maintenance_requests
for each row execute function public.set_ref_id();
