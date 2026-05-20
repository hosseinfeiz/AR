# `apps/web/` — Agent guide

This is the main product surface: marketing site, tenant portal, admin dashboard.
Astro v6, React 19 islands, Tailwind v4, deployed on Vercel (primary) and Cloudflare Workers (secondary).

## Layout

```
src/
├── components/
│   ├── primitives/         # F3 design system: Button, Card, Badge, FormField, Alert
│   ├── islands/            # React components hydrated on the client
│   └── *.astro             # Server-rendered shared components (Header, Footer, Seo, etc.)
├── layouts/Base.astro      # Single root layout; wraps every page with Seo + nav + footer
├── pages/
│   ├── *.astro             # Public marketing pages (5 are prerendered — see F4)
│   ├── admin/              # Admin dashboard — session.type === 'admin' required
│   ├── portal/             # Tenant portal — session.type === 'tenant' required
│   ├── buildings/[slug]/   # Per-building detail pages (SSR + edge cache)
│   ├── units/[id]/         # Per-unit detail pages (SSR + edge cache)
│   └── api/                # JSON API endpoints; all use apiHandler from lib/api-handler.ts
├── lib/
│   ├── auth.ts             # Cookie session helpers (admin or tenant)
│   ├── data.ts             # Public-page data layer (Supabase with fixture fallback)
│   ├── finance-data.ts     # Admin finance data layer
│   ├── api-handler.ts      # apiHandler(schema, handler) + ok/respond/badRequest/...
│   ├── logger.ts           # Structured JSON logger
│   └── supabase.ts         # Supabase client (anon)
│   └── supabase-admin.ts   # Supabase client (service role; server-only)
├── middleware.ts           # Request ID injection + log binding
└── env.d.ts                # App.Locals types
```

## What lives in `lib/` vs an island vs an Astro component

- **`.astro` server-rendered**: anything that doesn't need user interaction. Cards, tables, layouts.
- **`islands/*.tsx`**: forms, anything with React state, anything that calls fetch from the browser. Hydration costs bandwidth; keep the boundary tight.
- **`lib/`**: server-only logic. Never imported from islands.

## Patterns that matter

- **Sessions are cookie-based**, NOT Supabase Auth. `auth.ts:getSession(cookies)` returns `{ type: 'admin' | 'tenant', tenantId? }`. RLS uses a `managers_allowlist`-backed `is_manager()` helper, but tenant queries currently go through the service-role client. Migrating tenants to real Supabase Auth is a future cleanup.
- **Degraded mode**: `data.ts` queries Supabase, falls back to in-memory fixtures (`lib/fixtures.ts`, `lib/tenant-fixtures.ts`, `lib/finance-fixtures.ts`) if the query throws or the table doesn't exist yet. The site stays up.
- **API responses** are always `{ ok: true, ...data }` on success or `{ ok: false, error, code, issues? }` on failure. Use `apiHandler` to enforce this.
- **Logging**: every API route receives `locals.log` (a `Logger` from `lib/logger.ts`). Use `locals.log.info/warn/error`. Don't `console.log`.
- **Errors**: Sentry is wired in `astro.config.mjs` and auto-captures unhandled exceptions. For expected failures, log + return a typed error response; do not throw.

## Tests

- `pnpm --filter @ar/web test` — Vitest unit tests under `tests/**/*.test.ts` (excluding `tests/e2e/`).
- `pnpm --filter @ar/web test:e2e` — Playwright specs under `tests/e2e/`.
- `supabase db execute < supabase/tests/rls.spec.sql` — RLS policy smoke tests (requires `supabase db reset` first).

## Adding a new page

1. Decide: prerender or SSR? Marketing → prerender. Has session/Supabase per request → SSR. See F4 in the superpower plan.
2. Add `export const prerender = true` (or `false`) at the top of the frontmatter.
3. Use `Base.astro` as the layout. Pass `title` + `description` for SEO.
4. Public pages: cache headers go in `vercel.json` + `public/_headers`.
5. If protected: call `getSession(Astro.cookies)` first, redirect on null.

## Adding a new API route

1. Create `src/pages/api/.../whatever.ts`.
2. `export const prerender = false` (always — API routes are dynamic).
3. Define a Zod schema for the input.
4. `export const POST = apiHandler(SchemaOrNull, async (data, { locals, cookies }) => { ... })`.
5. Return via `ok(...)`, `badRequest(...)`, `notFound(...)`, `unauthorized()`, etc. Don't `new Response(...)` directly.

## Deploying

- **Vercel**: `git push` triggers preview/prod. `apps/web/vercel.json` controls headers + framework detection.
- **Cloudflare**: set `DEPLOY_TARGET=cloudflare` and use Workers/Pages. `apps/web/public/_headers` covers cache rules. `wrangler.toml` for the worker config.
- **Supabase migrations**: apply via `pnpm supabase db push` from repo root. The Supabase Edge Functions are deployed separately (`supabase functions deploy <name>`).
