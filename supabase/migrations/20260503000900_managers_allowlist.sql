create table public.managers_allowlist (
  email text primary key,
  role text not null default 'manager',
  added_at timestamptz not null default now()
);

create or replace function public.enforce_manager_allowlist()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.email is null then
    raise exception 'Email required for manager signup';
  end if;
  if not exists (select 1 from public.managers_allowlist where email = new.email) then
    raise exception 'Email % is not on the manager allowlist', new.email;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_manager_allowlist
before insert on auth.users
for each row execute function public.enforce_manager_allowlist();
