# System architecture

A 30-second mental model of how a request flows through AR Management.

```
                      ┌──────────────────────────┐
                      │  Browser / PWA (S9)      │
                      │  Astro-rendered HTML +   │
                      │  React islands           │
                      └────────────┬─────────────┘
                                   │
                                   ▼
              ┌─────────────────────────────────────┐
              │  Vercel Edge (primary) /            │
              │  Cloudflare Workers (alt)           │
              │  · prerendered marketing pages      │  ◀── F4 hybrid
              │    served as static HTML            │
              │  · SSR pages re-rendered per req    │
              │  · API routes / middleware          │
              └────────────┬────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
 ┌─────────────┐  ┌─────────────────┐  ┌─────────────────┐
 │  Supabase   │  │  Resend         │  │  Stripe (S1)    │
 │  · Postgres │  │  · email send   │  │  · ACH mandate  │
 │  · Storage  │  │  · webhook back │  │  · PaymentIntent│
 │  · Auth     │  │    to /api/     │  │  · webhook back │
 │    (admin)  │  │    webhooks/    │  │    to /api/     │
 │  · Edge Fns │  │    resend       │  │    stripe-      │
 │  · pgvector │  │                 │  │    webhook      │
 │    (S3)     │  └─────────────────┘  └─────────────────┘
 └──────┬──────┘
        │
        ▼  on INSERT into showing_requests / maintenance_requests
 ┌─────────────────────────────────────────────────────────┐
 │ pg_net trigger → Supabase Edge Function                 │
 │   notify-on-new-request                                 │
 │   (HMAC-secret-authenticated; ref P0/C5)                │
 │   · check manager_preferences (S5)                      │
 │   · either deliver now or queue for batch-notifications │
 └─────────────────────────────────────────────────────────┘
```

## Cross-cutting

- **Sessions**: cookie-based, `httpOnly` + `secure` in prod. `lib/auth.ts:getSession(cookies)` is the single read path. Admin login = SHA-256-hashed env-driven creds. Tenant login = SHA-256-hashed `password_sha256` stored on the row.
- **Observability**: `middleware.ts` mints a `request_id`, attaches `locals.log` (a `Logger` from `lib/logger.ts` — structured JSON), sets `x-request-id` on every response. Sentry wraps unhandled exceptions when `PUBLIC_SENTRY_DSN` is configured.
- **RLS**: every business table has RLS on. Public reads scoped (anon can read published rows). Manager mutations gated by `is_manager()`, which reads `(auth.jwt() ->> 'email')` and looks it up in `managers_allowlist`. Tenant-self-read remains app-enforced via the service-role client until Supabase Auth is wired up for tenants.
- **Degraded mode**: `lib/data.ts` falls back to in-memory fixtures (`lib/fixtures.ts`, `lib/tenant-fixtures.ts`, `lib/finance-fixtures.ts`) when Supabase is unreachable or returns an error. The site stays up; a structured log line records the fallback.

## What lives where

| Concern | Home |
|---|---|
| Public marketing HTML | `apps/web/src/pages/{index,about,contact,privacy,terms}.astro` (prerendered) |
| Building/unit detail | `apps/web/src/pages/{buildings/[slug],units/[id]}.astro` (SSR + edge cache) |
| Listings + filter | `apps/web/src/pages/listings.astro` (SSR + edge cache) |
| Tenant portal | `apps/web/src/pages/portal/*` (SSR, cookie-gated) |
| Admin dashboard | `apps/web/src/pages/admin/*` (SSR, cookie-gated) |
| API routes | `apps/web/src/pages/api/*.ts` (all `apiHandler`-wrapped) |
| Shared schemas | `packages/shared/src/schemas/*` (Zod schemas reused by web + edge functions) |
| Edge functions | `supabase/functions/*` (Deno) |
| Migrations | `supabase/migrations/*.sql` |
| RLS policy tests | `supabase/tests/rls.spec.sql` |
| Runbooks | `docs/superpowers/runbooks/*` |
| Specs / plans | `docs/superpowers/{specs,plans}/*` |
| ADRs | `docs/adr/*` |

## Deploy targets

- **Vercel** is primary. Auto-deploys from `main`; preview deploys per PR. `apps/web/vercel.json` configures cache headers.
- **Cloudflare** is alternate. Set `DEPLOY_TARGET=cloudflare` to use the Workers adapter. `apps/web/public/_headers` configures cache rules.
- **Supabase** runs the database, storage, and edge functions. Migrations are applied via `pnpm supabase db push`. Function secrets via `supabase secrets set`.

## Things that are NOT here (and where they're going)

- **Native iOS/Android** — parked. The PWA (S9) is the supported mobile path. See [ADR-0003](../adr/0003-pwa-not-native.md).
- **Lynx mobile** — parked. See [ADR-0001](../adr/0001-lynx-to-astro.md).
- **Real payment processing** — landing in S1 (ACH-first via Stripe direct). See [ADR-0002](../adr/0002-ach-first-rent.md).
- **AI lease Q&A** — landing in S3 (pgvector + Claude RAG).
- **Multi-tenant / white-label** — deferred until there is a second customer.
