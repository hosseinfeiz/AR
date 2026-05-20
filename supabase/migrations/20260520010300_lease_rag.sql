-- S3: Lease Q&A via RAG (pgvector + Claude)
--
-- Ingest lease PDFs, chunk them, embed via OpenAI text-embedding-3-large
-- (truncated to 1536 dimensions to match `vector(1536)`), retrieve top-k chunks
-- with cosine similarity, and answer questions with Claude (sonnet-4.6) using
-- prompt caching on the lease context.
--
-- Owned by S3 of the 2026-05-20 superpower plan.

-- 1. pgvector
create extension if not exists "vector";

-- 2. is_manager() helper — used by RLS. Defined idempotently so we don't
-- depend on a separate (forbidden) migration. Other agents may also define
-- it; `create or replace function` makes this safe.
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.managers_allowlist
    where email = (auth.jwt() ->> 'email')
  );
$$;

-- 3. Document-level status enum.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lease_document_status') then
    create type public.lease_document_status as enum ('pending', 'ingesting', 'ready', 'failed');
  end if;
end$$;

-- 4. lease_documents — one row per uploaded lease PDF.
create table if not exists public.lease_documents (
  id           uuid primary key default gen_random_uuid(),
  lease_id     text not null,                          -- fixture leases use text ids (e.g. 'lease-0001-...')
  storage_path text not null,                          -- key inside the `leases` Supabase Storage bucket
  page_count   int,
  status       public.lease_document_status not null default 'pending',
  error        text,                                   -- last ingestion error, if any
  ingested_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists lease_documents_lease_id_idx on public.lease_documents (lease_id);
create index if not exists lease_documents_status_idx   on public.lease_documents (status);

drop trigger if exists trg_lease_documents_updated_at on public.lease_documents;
create trigger trg_lease_documents_updated_at
before update on public.lease_documents
for each row execute function public.set_updated_at();

-- 5. lease_chunks — chunked + embedded text from a lease document.
create table if not exists public.lease_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.lease_documents(id) on delete cascade,
  lease_id     text not null,                          -- denormalised for fast retrieval by lease
  chunk_index  int  not null,
  page_number  int,
  content      text not null,
  tokens       int,
  embedding    vector(1536),                            -- OpenAI text-embedding-3-large @ 1536 dims
  created_at   timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists lease_chunks_lease_id_idx     on public.lease_chunks (lease_id);
create index if not exists lease_chunks_document_id_idx  on public.lease_chunks (document_id);

-- ivfflat over cosine — `lists` is intentionally small for the demo dataset
-- (rule of thumb: lists ≈ sqrt(N) for production). Build the index even when
-- the table is empty; Postgres will scan when no index pages exist yet.
create index if not exists lease_chunks_embedding_cos_idx
  on public.lease_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- 6. RLS
alter table public.lease_documents enable row level security;
alter table public.lease_chunks    enable row level security;

-- Managers can do everything.
drop policy if exists "lease_documents manager all" on public.lease_documents;
create policy "lease_documents manager all" on public.lease_documents
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "lease_chunks manager all" on public.lease_chunks;
create policy "lease_chunks manager all" on public.lease_chunks
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- Tenant self-read of their lease's chunks.
--
-- ⚠️ GAP: tenants are currently authenticated via a cookie-based mock
-- (`lib/auth.ts`), NOT Supabase Auth. There is no `tenants` row with an
-- `auth_user_id` column wired up yet, so the policy below cannot be enabled
-- safely. The portal `/api/portal/lease-qa` endpoint uses the service-role
-- client and enforces tenant→lease mapping in application code. Re-enable
-- this policy once Supabase-Auth is wired for tenants (see S6/S7 plans).
--
-- create policy "lease_chunks tenant self read" on public.lease_chunks
--   for select to authenticated
--   using (
--     exists (
--       select 1
--       from public.tenants t
--       where t.lease_id = lease_chunks.lease_id
--         and t.auth_user_id = auth.uid()
--     )
--   );

-- 7. Cosine-similarity RPC. Bypasses RLS via security definer because the
-- portal endpoint validates the tenant → lease mapping in application code.
create or replace function public.match_lease_chunks(
  p_lease_id     text,
  p_query_embed  vector(1536),
  p_match_count  int default 6
)
returns table (
  id           uuid,
  document_id  uuid,
  chunk_index  int,
  page_number  int,
  content      text,
  similarity   float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.page_number,
    c.content,
    1 - (c.embedding <=> p_query_embed) as similarity
  from public.lease_chunks c
  where c.lease_id = p_lease_id
    and c.embedding is not null
  order by c.embedding <=> p_query_embed
  limit greatest(p_match_count, 1);
$$;

grant execute on function public.match_lease_chunks(text, vector, int)
  to anon, authenticated, service_role;
