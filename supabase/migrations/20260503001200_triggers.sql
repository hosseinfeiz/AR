create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
as $$
declare
  v_actor uuid := auth.uid();
  v_diff jsonb;
begin
  if (tg_op = 'INSERT') then
    v_diff := to_jsonb(new);
    insert into public.audit_log (table_name, record_id, action, actor_id, diff)
    values (tg_table_name, new.id, 'insert', v_actor, v_diff);
    return new;
  elsif (tg_op = 'UPDATE') then
    v_diff := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    insert into public.audit_log (table_name, record_id, action, actor_id, diff)
    values (tg_table_name, new.id,
            case when old.status is distinct from new.status then 'status_change' else 'update' end,
            v_actor, v_diff);
    return new;
  elsif (tg_op = 'DELETE') then
    v_diff := to_jsonb(old);
    insert into public.audit_log (table_name, record_id, action, actor_id, diff)
    values (tg_table_name, old.id, 'delete', v_actor, v_diff);
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_audit_buildings
after insert or update or delete on public.buildings
for each row execute function public.write_audit();

create trigger trg_audit_units
after insert or update or delete on public.units
for each row execute function public.write_audit();

create trigger trg_audit_showing
after insert or update or delete on public.showing_requests
for each row execute function public.write_audit();

create trigger trg_audit_maint
after insert or update or delete on public.maintenance_requests
for each row execute function public.write_audit();
