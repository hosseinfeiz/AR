-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "pg_net";

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
