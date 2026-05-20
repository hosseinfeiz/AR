# Lease Q&A — RAG Runbook (S3)

Tenants ask natural-language questions about their lease ("when is my rent due?", "can I sublet?") and get answers cited to specific pages of the lease PDF.

## Architecture

```
Lease PDF in `leases` bucket
   │
   │  POST /api/admin/leases/ingest  (manager-triggered, retryable)
   ▼
 pdf-parse → chunk(size=1000, overlap=150)
   │
   ▼
 OpenAI text-embedding-3-large (truncated to 1536 dims)
   │
   ▼
 lease_documents + lease_chunks (pgvector, ivfflat cosine)

                              Tenant asks question
                                      │
                                      ▼  POST /api/portal/lease-qa
                              identify active lease
                                      │
                                      ▼
                              embed question → match_lease_chunks() RPC (k=6)
                                      │
                                      ▼
                              Claude `claude-sonnet-4-6`
                              system: static rules
                              user: [cached lease excerpts] + [question]
                                      │  (cache_control: ephemeral on excerpts)
                                      ▼
                              SSE-style stream → React island renders deltas + citation pills
```

## Configuration

| Variable | Required | Used for |
|---|---|---|
| `OPENAI_API_KEY` | yes (ingest + retrieve) | Embeddings only (`text-embedding-3-large` @ 1536 dims) |
| `ANTHROPIC_API_KEY` | yes (retrieve) | Generation (`claude-sonnet-4-6`) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | yes | Storage + DB |

The factories in `apps/web/src/lib/embeddings.ts` and `apps/web/src/lib/anthropic.ts` throw a clear error if their key is unset — the Q&A route surfaces this as a 500 with the error message in the body.

## Operator playbook

### Ingesting a lease

1. Upload the lease PDF to the `leases` bucket as `leases/<lease_id>.pdf` (e.g. `leases/lease-0001-0000-0000-000000000001.pdf`). The ingest endpoint will also auto-create the bucket if S2 hasn't.
2. Hit the ingest endpoint as an admin:

   ```sh
   curl -X POST http://localhost:4321/api/admin/leases/ingest \
     -H 'cookie: ar_auth=admin' \
     -H 'content-type: application/json' \
     -d '{"lease_id":"lease-0001-0000-0000-000000000001"}'
   ```

3. The endpoint is idempotent: re-POSTing a lease wipes its old chunks and re-ingests. Use this whenever the source PDF changes.
4. Status lives in `lease_documents.status` (`pending | ingesting | ready | failed`). On failure, `lease_documents.error` has the message.

### Adjusting chunk size

`chunk(pages, { size: 1000, overlap: 150 })` is the default. For very long leases (50+ pages) tighten to `{ size: 800, overlap: 100 }`. For short single-page agreements, raise to `{ size: 1500, overlap: 100 }`. There's no migration — just re-ingest.

### Prompt caching

The lease excerpt block in the user turn carries `cache_control: { type: 'ephemeral' }`. The Anthropic 5-minute prefix cache will hit on follow-up questions about the same lease within 5 minutes, dropping the context-token cost to ~0.1× of base. Verify in the API response `usage.cache_read_input_tokens` — if it's zero across repeated requests on the same lease, a silent invalidator slipped in (timestamp, UUID, reordered chunks).

## Known gaps

- **RLS for tenants** is documented but commented out in `20260520010300_lease_rag.sql`. Today the portal route uses the service-role client and enforces the tenant→lease mapping in application code (`leaseForTenant(tenantId)`). When Supabase Auth is wired for tenants (S6/S7), uncomment the `lease_chunks tenant self read` policy and switch the portal route to an anon-key client with the user's JWT.
- **Citation deep-link** in the UI calls a `?signed=1` query branch that isn't implemented yet — it currently no-ops. Wiring this to `getAdminClient().storage.from('leases').createSignedUrl(...)` is a follow-up.
- **Multi-document leases:** the schema supports multiple `lease_documents` per `lease_id` (addendums), but ingest currently does an upsert by lease_id. Extend if/when addendums become common.

## Testing

- Unit: `pnpm --filter @ar/web test` (covers chunking boundaries, cosine ranking, citation truncation, mocked Anthropic/OpenAI calls).
- Manual: log in as a tenant whose lease has been ingested, visit `/portal/lease-qa`, ask "when is my rent due?" — the answer should arrive token-by-token with a `Page N` citation pill.

## Cost model (rough)

- Embeddings: $0.13 / 1M tokens × ~3K tokens per typical lease ≈ $0.0004 per ingestion.
- Generation: Claude Sonnet 4.6 at $3 / $15 per 1M (in/out). With caching, follow-up questions on the same lease pay ~$0.0003 / question.

Roll up monthly cost = (ingestions × $0.0004) + (questions × ~$0.0008 amortised).
