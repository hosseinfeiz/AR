create table public.audit_log (
  id bigserial primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','delete','status_change')),
  actor_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_record on public.audit_log (table_name, record_id, created_at desc);
