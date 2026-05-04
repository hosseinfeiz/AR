# AR Management — Astro Web App Spec (Pivot from Lynx)

**Date:** 2026-05-04
**Supersedes:** Frontend portion of `docs/superpowers/specs/2026-05-03-ar-management-public-site-design.md`. Backend (Supabase, Edge Functions, RLS, schemas, Resend, Turnstile) is unchanged.

## Why this pivot

The 2026-05-03 spike (`docs/superpowers/spike/SPIKE-NOTES.md`) confirmed that **rspeedy 0.14 produces no web build** — only a Lynx native bundle for mobile runtimes. The user-chosen "single Lynx codebase to iOS + Android + Web" is not currently supported by the Lynx toolchain. For two apartment buildings whose leasing funnel depends on Google search, a mobile-only app is not a viable substitute for a website. User chose **Option B**: build a web app first, defer mobile.

## Goals (v1, unchanged from prior spec)

1. Public marketing site for Grass Lake Manor + Winnetka Manor (responsive, fast, indexable).
2. Browse listings (filterable across both buildings).
3. **Schedule-a-showing** intake form (slot picker or up to 3 preferred dates).
4. **Maintenance request** intake form (no tenant login; photo upload via signed URLs).
5. Manager triage in **Supabase Studio** (no custom admin UI in v1).
6. Email fan-out via existing `notify-on-new-request` Edge Function.

## Non-goals (deferred to later sub-projects)

- Tenant accounts, lease docs, rent payments
- Online accounting, owner reporting, 1099 e-filing
- Native mobile apps (paused as Sub-project #1.5)
- AI assistant, SMS, calendar sync, multi-language

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Astro 5.x** | Best SEO out of the box (true SSG/SSR, zero-JS by default), hybrid rendering for forms, smallest possible bundle for a marketing/listings site |
| Language | TypeScript 5.x (strict) | shared with `@ar/shared` |
| Styling | **Tailwind CSS v4** | Fast iteration, small final CSS, integrates cleanly with Astro |
| Interactive forms | **React 19 islands** | `@astrojs/react` for the maintenance + showing forms (use react-hook-form + Zod from `@ar/shared`) |
| Hosting | **Vercel** with `@astrojs/vercel` adapter | Zero-config Astro deploy, edge-first, free tier covers two-building traffic; matches what the existing `launch.md` runbook already documents |
| Image optimization | Astro built-in `<Image>` + Supabase Storage transform URLs | Avoids extra deps |
| State / data fetching | **Server-rendered** by default; React Query in islands only where needed (form submission) | Keeps client JS tiny |
| Email forms / captcha | **Cloudflare Turnstile** (already wired in Edge Function) | Same as before |
| Sentry | `@sentry/astro` | First-class Astro integration |
| SEO | `@astrojs/sitemap` + custom OpenGraph + JSON-LD `Apartment` schema | Standard |
| Tests | **Vitest** (units), **Playwright** (E2E + axe-playwright a11y) | Same as before |

## Architecture

```
                          ┌─────────────────────────────────┐
                          │  Astro app (apps/web)             │
                          │   Vercel deploy                   │
                          │   ├─ SSG: /, /buildings/[slug],   │
                          │   │  /listings, /units/[id],      │
                          │   │  /about, /contact, /privacy,  │
                          │   │  /terms (cached, fast)        │
                          │   ├─ SSR: /listings (filtered),   │
                          │   │  /sitemap.xml                 │
                          │   └─ Islands: forms (React)       │
                          └────────────────┬─────────────────┘
                                           │ HTTPS (anon + Edge Functions)
                          ┌────────────────▼─────────────────┐
                          │  Supabase (existing — unchanged)  │
                          │   Postgres + Storage + Auth +     │
                          │   Edge Functions: request-upload- │
                          │   urls, notify-on-new-request,    │
                          │   health                          │
                          └────────────────┬─────────────────┘
                                           │
                                  ┌────────▼────────┐
                                  │  Resend (email) │
                                  └─────────────────┘
```

## Routing (Astro file-based)

```
src/pages/
  index.astro              → /
  buildings/[slug].astro   → /buildings/grass-lake-manor, /buildings/winnetka-manor
  listings.astro           → /listings (with ?building, ?bedrooms, ?max_rent query params)
  units/[id].astro         → /units/<uuid>
  schedule.astro           → /schedule (with ?unit=<uuid> param)
  maintenance.astro        → /maintenance
  about.astro              → /about
  contact.astro            → /contact
  privacy.astro            → /privacy
  terms.astro              → /terms
  robots.txt.ts            → /robots.txt
  sitemap.xml.ts           → /sitemap.xml (or use @astrojs/sitemap)
  api/health.ts            → /api/health (uptime monitor target)
```

## Components

```
src/components/
  Layout.astro             # base shell (header, footer, slot)
  Header.astro
  Footer.astro
  BuildingCard.astro       # static, no JS
  UnitCard.astro           # static
  PhotoGallery.astro       # static, with <Image>
  AmenityList.astro        # static
  Seo.astro                # meta tags + OpenGraph + JSON-LD prop
  islands/
    MaintenanceForm.tsx    # React island: form + photo uploader + Turnstile
    ShowingForm.tsx        # React island: slot picker / date picker + Turnstile
    PhotoUploader.tsx      # React, used by MaintenanceForm
    TurnstileWidget.tsx    # React (or vanilla); web-only
    FilterChips.tsx        # React island: listings filter UI
```

## Data flow

- **All public read paths** (buildings, units, photos, slots) execute at build time (`getStaticPaths` + `Astro.props`) or at request time using the Supabase **anon** client. RLS already restricts reads to `is_published = true` and `status in ('available','coming_soon')`.
- **Form submissions** (`MaintenanceForm`, `ShowingForm`) use the Supabase anon client to `.insert()` into `maintenance_requests` / `showing_requests`. RLS allows `INSERT` to anon. The Postgres trigger (already deployed) calls the `notify-on-new-request` Edge Function which fans out emails.
- **Photo uploads** for maintenance requests call the existing `request-upload-urls` Edge Function (Turnstile + signed URLs into `maintenance-uploads` bucket).

## SEO

- `<head>` per page: title, description, canonical, OpenGraph, Twitter Card.
- JSON-LD `Apartment` per unit (price, beds, baths, address, availability).
- `@astrojs/sitemap` generates `/sitemap.xml` from all pages including dynamic routes.
- `robots.txt` allows production, disallows previews.

## Performance budget

- Lighthouse Performance ≥ 95 mobile (Astro defaults make this very achievable).
- LCP < 2.0s, INP < 200ms, CLS < 0.05.
- Form pages may dip to 85+ due to React island.

## Out of scope (still)

Same as prior spec §12 — tenant accounts, payments, accounting, AI, SMS, native admin, etc.

## Open items (still gating production)

- `OPEN-1` Production domain
- `OPEN-2` Manager email allowlist
- `OPEN-3` Building photos
- `OPEN-4` Apple/Google developer accounts (only if Sub-project #1.5 starts)
- `OPEN-5` Resend sending domain DNS

## Reused artifacts (no rework needed)

- `packages/shared/` — Zod schemas, ref-id, env validation
- `supabase/migrations/` — all 13 migrations
- `supabase/functions/` — all 3 Edge Functions
- `supabase/seed.sql` — two-building seed
- `docs/superpowers/runbooks/launch.md`, `mobile-qa.md`, `pre-launch.md` — minor edits where they reference Lynx

## What changes from the original spec

- `apps/lynx/` is parked. Source preserved for Sub-project #1.5.
- New `apps/web/` directory holds the Astro app.
- CI workflow gets new commands (Astro build, Playwright against Astro dev server).
- `vercel.json` lives at `apps/web/` root.
- `eas.json` (mobile) is dormant until Sub-project #1.5 resumes.
