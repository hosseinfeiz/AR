# AR Management — Public Site & Intake (Sub-project #1) Design

**Date:** 2026-05-03
**Owner:** AR Management (single-tenant)
**Properties in scope:** Grass Lake Manor Apartments, Winnetka Manor Apartments
**This spec covers:** Sub-project #1 only — public marketing site, listings, schedule-a-showing, maintenance request intake, and manager triage. Tenant accounts, online rent payments, accounting, and AI features are explicitly out of scope and will be planned as separate sub-projects later.

---

## 1. Goals & Non-Goals

### Goals
1. Public, mobile- and desktop-responsive presence for both buildings with photos, amenities, neighborhood info, unit availability, and pricing.
2. Frictionless **maintenance request** intake — no tenant login required.
3. **Schedule-a-showing** intake — prospects pick from manager-published time windows or propose up to three preferred dates.
4. **Listings** browser — all available units across both buildings, filterable.
5. Cross-platform delivery (iOS, Android, Web) from a single Lynx codebase.
6. Manager workflow to update listings and triage incoming requests with zero custom admin UI in v1 (use Supabase Studio).
7. Basic SEO viable on the web target.

### Non-Goals (v1)
- Tenant logins, lease documents, rent payments, accounting, owner statements, 1099s, AI assistants, application/screening forms, SMS notifications, calendar-sync for showings, multi-language, native admin UI. All deferred to later sub-projects.

### Success criteria
- Web Lighthouse Performance ≥ 80 on a Building page (mobile profile).
- Maintenance request submitted on iOS, Android, and Web in under 60 seconds end-to-end (manual stopwatch test).
- Manager email inbound within 30 seconds of any new request (Edge Function + Resend).
- Zero secrets in source; all keys in Vercel env vars / Supabase Vault.
- A new available unit added in Supabase Studio appears on the public Listings page within one cache cycle (≤ 60 seconds).

---

## 2. Architecture

```
                    ┌───────────────────────────────────┐
                    │  Lynx app (rspeedy, one codebase)  │
                    │   ├─ iOS         (App Store)       │
                    │   ├─ Android     (Play Store)      │
                    │   └─ Web         (Vercel)          │
                    └──────────────────┬────────────────┘
                                       │ HTTPS + WSS
                                       │ @supabase/supabase-js
                    ┌──────────────────▼────────────────┐
                    │  Supabase (single project, US-East)│
                    │   ├─ Postgres                       │
                    │   ├─ Auth (managers, magic link)    │
                    │   ├─ Storage (photos, docs)         │
                    │   ├─ Realtime (admin live updates)  │
                    │   └─ Edge Functions (email hooks)   │
                    └──────────────────┬────────────────┘
                                       │ HTTPS
                              ┌────────▼────────┐
                              │  Resend (email) │
                              └─────────────────┘
```

### Tech choices (locked)
| Layer | Choice | Reason |
|---|---|---|
| Frontend framework | **Lynx + ReactLynx**, scaffolded via `npm create rspeedy@latest` | User requirement; cross-platform from one codebase. |
| Web hosting | **Vercel** | First-class Lynx web target deploy; preview URLs per PR. |
| Mobile build/distribution | **EAS Build** (Expo Application Services) | Cleanest cross-platform CI for native; works with non-Expo projects via prebuild config. |
| Backend (BaaS) | **Supabase Pro** ($25/mo) | Postgres + Auth + Storage + Realtime + Edge Functions in one product; matches Phase 1 of `AR.md`. |
| Database | **Postgres 15+ (managed by Supabase)** | Standard, JSON-friendly, enables future migration. |
| Auth | **Supabase Auth, magic link (email)** | No passwords, no SSO complexity for v1; v1 has 3–5 manager accounts. |
| Storage | **Supabase Storage**, two buckets: `public-photos`, `maintenance-uploads` | Bundled, simple ACL via RLS. |
| Email | **Resend** + React Email templates | Modern DX, easy templates, called from Edge Functions. |
| Notifications fan-out | **Edge Function** triggered by Postgres trigger via `pg_net` HTTP webhook | Native Supabase pattern; avoids external queue. |
| State / data fetching (web + native) | **TanStack Query v5** | Same API across platforms; cache invalidation handled. |
| Styling | **Lynx CSS-in-JS via `@lynx-js/react`** (or `@lynx-js/styling` per docs at spike) | Spike will pick the canonical idiom. |
| Forms & validation | **react-hook-form + Zod** | Works in Lynx runtime (pure JS). |
| Tests | **Vitest** (unit), **Playwright** (E2E web), manual mobile QA matrix, **axe-playwright** (a11y) | Standard 2026 stack. |
| Observability | **Sentry** (errors, web + native) + Supabase logs + Resend dashboard | Minimal but sufficient for v1. |
| CI/CD | **GitHub Actions** | Lint + typecheck + test on PR; deploy web on merge to `main`; manual EAS submit for mobile releases. |

### Single-tenant assumption
This is **not** a SaaS. There is one customer (AR Management), two buildings, a small set of managers. There is no `organizations` or `tenants` table; building IDs are the partition key for everything user-facing.

---

## 3. Data Model

All tables in schema `public`. UUID primary keys (`gen_random_uuid()`). All tables have `created_at`, `updated_at` (managed via trigger).

### `buildings`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text UNIQUE NOT NULL | URL slug, e.g. `grass-lake-manor` |
| name | text NOT NULL | "Grass Lake Manor Apartments" |
| address_line1 | text NOT NULL | |
| address_line2 | text | |
| city, state, postal_code, country | text | country default `US` |
| lat, lng | numeric | for embedded map |
| description_md | text | markdown |
| neighborhood_md | text | markdown — neighborhood highlights |
| amenities | text[] | e.g. `{"in-unit laundry","parking","pool"}` |
| hero_photo_path | text | reference into `public-photos` bucket |
| contact_phone, contact_email | text | building-specific fallback |
| seo_title, seo_description | text | per-building meta |
| is_published | boolean DEFAULT false | gate before going live |

Seeded with two rows: Grass Lake Manor, Winnetka Manor.

### `units`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| building_id | uuid FK → buildings.id | |
| unit_number | text NOT NULL | "Apt 3B" |
| bedrooms | smallint NOT NULL | 0 = studio |
| bathrooms | numeric(2,1) NOT NULL | 1.5, 2.0 |
| sqft | integer | nullable |
| monthly_rent_cents | integer NOT NULL | store cents to avoid float |
| deposit_cents | integer | nullable |
| available_from | date | `null` if not yet listed |
| status | text NOT NULL CHECK (status IN ('available','leased','coming_soon','off_market')) | |
| floor_plan_path | text | reference into `public-photos` |
| description_md | text | |
| sort_order | integer DEFAULT 0 | |

UNIQUE(building_id, unit_number).

### `building_photos`, `unit_photos`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| building_id / unit_id | uuid FK | one of the two tables |
| storage_path | text NOT NULL | path in `public-photos` |
| alt_text | text NOT NULL | required for a11y |
| sort_order | integer DEFAULT 0 | |

### `availability_slots` (showing windows)
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| building_id | uuid FK NOT NULL | |
| unit_id | uuid FK | nullable — slot can be building-wide |
| starts_at, ends_at | timestamptz NOT NULL | |
| status | text NOT NULL CHECK (status IN ('open','booked','blocked')) | |
| booked_by_request_id | uuid FK → showing_requests.id | nullable |
| created_by | uuid FK → auth.users.id | manager who published |

### `showing_requests`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| building_id | uuid FK NOT NULL | |
| unit_id | uuid FK | nullable |
| slot_id | uuid FK → availability_slots.id | nullable — set if prospect picked a slot |
| prospect_name, prospect_email, prospect_phone | text | email NOT NULL |
| preferred_dates | jsonb | up to 3 ISO date strings if no slot picked |
| message | text | free text |
| status | text NOT NULL DEFAULT 'new' CHECK (status IN ('new','scheduled','completed','canceled','no_show')) | |
| scheduled_at | timestamptz | filled by manager |
| manager_notes | text | |
| source | text | `web`, `ios`, `android` for analytics |

### `maintenance_requests`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| building_id | uuid FK NOT NULL | |
| unit_number | text NOT NULL | free text — tenant types it |
| tenant_name | text NOT NULL | |
| tenant_email | text | one of email/phone NOT NULL via CHECK constraint |
| tenant_phone | text | |
| issue_type | text NOT NULL CHECK (issue_type IN ('plumbing','electrical','hvac','appliance','pest','locks','other')) | |
| urgency | text NOT NULL CHECK (urgency IN ('low','normal','high','emergency')) | |
| description | text NOT NULL | |
| photo_paths | text[] DEFAULT '{}' | refs into `maintenance-uploads` |
| status | text NOT NULL DEFAULT 'new' CHECK (status IN ('new','acknowledged','in_progress','resolved','closed')) | |
| assigned_to | uuid FK → auth.users.id | nullable |
| manager_notes | text | |
| source | text | `web`, `ios`, `android` |

### `audit_log`
| Column | Type | Notes |
|---|---|---|
| id | bigserial PK | |
| table_name | text NOT NULL | |
| record_id | uuid NOT NULL | |
| action | text NOT NULL CHECK (action IN ('insert','update','delete','status_change')) | |
| actor_id | uuid | nullable for anon inserts |
| diff | jsonb | column-level before/after for updates |
| created_at | timestamptz DEFAULT now() | |

Populated by an `AFTER INSERT/UPDATE/DELETE` trigger on every business table. No row in this table is ever deleted.

### Migrations & seeds
- Use Supabase CLI `supabase db diff` + `supabase migration new`.
- Seed file inserts the two building rows and a starter set of empty status enums.

---

## 4. Public Screens & User Journeys

All screens are in the **same Lynx app**; the web target uses URL routes, mobile uses a stack navigator.

| Route / Screen | Web URL | Mobile equivalent | Purpose |
|---|---|---|---|
| Home | `/` | Home tab | Brand intro, both building cards, top-level CTAs |
| Building detail | `/buildings/[slug]` | Building stack screen | Hero, photo gallery, amenities, neighborhood markdown, list of available units, building CTAs |
| Listings index | `/listings` | Listings tab | All available units across both buildings, filterable by building/bedrooms/max rent |
| Unit detail | `/units/[id]` | Unit stack screen | Photos, specs, rent, "Schedule a showing" CTA, "Apply" placeholder (links to email) |
| Schedule a showing | `/schedule?unit=[id]` | Modal flow | (1) pick a unit (skipped if pre-selected), (2) pick from open slots OR propose up to 3 dates, (3) name/email/phone, (4) confirmation |
| Maintenance request | `/maintenance` | Maintenance tab | (1) building, (2) unit number + name + contact, (3) issue type + urgency, (4) description + up to 5 photos, (5) confirmation |
| About | `/about` | Drawer item | Static content |
| Contact | `/contact` | Drawer item | Phone, email, addresses, embedded map per building |
| Privacy / Terms | `/privacy`, `/terms` | Drawer item | Static markdown |

### Conversion-critical flows (golden paths)

**Submit a maintenance request** (Lighthouse for the web flow ≥ 80):
1. Tap **Maintenance** in tab bar / nav.
2. Pick building → enter unit number → name + email or phone.
3. Pick `issue_type` from a fixed list, pick `urgency` (radio).
4. Type description, optionally attach up to 5 photos (camera or library on mobile, file input on web).
5. Submit → see in-app confirmation with request reference ID, also receive a confirmation email within 30s.

**Request a showing**:
1. From a Unit detail page → tap **Schedule a showing**.
2. If manager-published `availability_slots` exist for that unit/building, present them as a list. Else show three date pickers ("preferred date 1/2/3").
3. Name + email + phone + optional message.
4. Submit → confirmation screen + email.

**Browse and filter listings**:
1. **Listings** tab.
2. Filter chips: building (Grass Lake / Winnetka / both), bedrooms (Studio / 1 / 2 / 3+), max rent.
3. Sort: Lowest rent / Most recent.
4. Tap a card → Unit detail.

### Calls to action
Persistent footer (web) and tab bar (mobile) include: **Schedule a showing**, **Maintenance**, **Call us**.

---

## 5. Manager Workflow (v1 = Supabase Studio)

No custom admin code in v1. Managers operate inside the Supabase project's **Table Editor** and **Storage** UI:

- **Update a listing:** Edit row in `units`, set `status='available'`, fill `monthly_rent_cents`, `available_from`. Upload photos to `public-photos/units/{unit_id}/` then insert rows in `unit_photos`.
- **Triage maintenance:** Filter `maintenance_requests` by `status='new'`. Open row → set `status='acknowledged'`, `assigned_to`, `manager_notes`. Add a column shortcut view in Studio for the common workflow.
- **Triage showing requests:** Filter `showing_requests` by `status='new'`. Pick a slot or pick one of the three preferred dates → set `scheduled_at`, `status='scheduled'`. (System does **not** automatically email the prospect on status change in v1; manager copies a one-line confirmation email manually. This is acceptable for ~10 requests/month at two buildings.)
- **Publish availability slots:** Insert rows into `availability_slots` with `status='open'`.

Managers receive **email** notifications (Section 6) for any new request and use Studio's **Realtime** view to see new rows live.

> **When to graduate from Studio:** when the manager team grows past 3 people, or when status emails to prospects need to be automated, build a small Lynx admin route gated by `is_manager()` RLS. That work is Sub-project #1.5.

---

## 6. Auth, Permissions, and RLS

### Auth
- Supabase Auth, **email magic link only**. No passwords, no OAuth providers in v1.
- A `managers_allowlist` table (`email text PK, role text DEFAULT 'manager'`) seeded with the actual manager emails. Trigger on `auth.users` INSERT rejects sign-ins not in the allowlist.

### Roles
- `anon` — unauthenticated public.
- `authenticated` — any logged-in user (managers in v1).

### RLS policies (turn on RLS for **every** table)
| Table | anon | authenticated |
|---|---|---|
| buildings | SELECT WHERE `is_published = true` | SELECT, UPDATE (no INSERT/DELETE — seeded) |
| units | SELECT WHERE `status IN ('available','coming_soon')` | full CRUD |
| building_photos, unit_photos | SELECT all | full CRUD |
| availability_slots | SELECT WHERE `status='open' AND starts_at > now()` | full CRUD |
| showing_requests | INSERT only (no SELECT/UPDATE/DELETE) | full CRUD |
| maintenance_requests | INSERT only | full CRUD |
| audit_log | none | SELECT only (write via trigger as `service_role`) |

### Storage policies
- **`public-photos`** bucket: public-read; authenticated write.
- **`maintenance-uploads`** bucket: anon write (capped to 5 files, 10 MB each via Edge Function pre-signed URL flow); authenticated read; no public read.

### Client uploads from anon users
Maintenance photo uploads use a **two-step flow**:
1. Client calls Edge Function `request-upload-urls` with a CAPTCHA token (Cloudflare Turnstile) and a count (1–5).
2. Edge Function validates the token, generates short-lived signed upload URLs into `maintenance-uploads/{request_id_temp}/`, returns them.
3. Client uploads files directly to those URLs.
4. Client submits the maintenance request with `photo_paths` filled in.

This prevents anonymous storage flooding without burdening tenants with a login.

---

## 7. Email Notifications

### Trigger pattern
Postgres `AFTER INSERT` trigger on `showing_requests` and `maintenance_requests` calls `pg_net.http_post()` against the Edge Function `/functions/v1/notify-on-new-request` with `{ table, record_id }`.

### Edge Function `notify-on-new-request`
1. Reads the row by id (using service role key).
2. Sends two emails via Resend:
   - **Manager fan-out:** to every email in `managers_allowlist`, subject `[AR Management] New {maintenance|showing} request — {building name} #{ref_id}`, body includes details + a Studio deep link.
   - **Submitter confirmation:** to `tenant_email` / `prospect_email`, subject `We received your request — AR Management`, body includes a friendly thank-you + 24-hour response promise.
3. On Resend failure → write a row to `notification_failures` table for manual recovery; no retries in v1.

### Templates
React Email components, compiled at deploy time, live in `supabase/functions/notify-on-new-request/_templates/`.

### Emergency urgency
`maintenance_requests.urgency = 'emergency'` adds **all-caps subject prefix** `[EMERGENCY]` and pings a configured webhook URL (Slack/Discord) per environment. **No SMS in v1** — explicit YAGNI; deferred to Sub-project #1.5.

---

## 8. SEO, Performance, and Accessibility

The user accepted that all three platforms (iOS, Android, Web) come from the single Lynx codebase. SEO requires the web target to render server-side or pre-rendered HTML.

### Plan
- During the **48-hour spike** (Step 0), validate that rspeedy can produce SSR/SSG HTML for the marketing routes (`/`, `/buildings/[slug]`, `/listings`, `/units/[id]`). The Lynx team has been adding SSR support; if the spike confirms it works, we use it. If not, we fall back to **statically pre-rendered HTML snapshots** at build time for these routes only (interactive pieces hydrate client-side).
- Per-route OpenGraph + Twitter Card meta.
- **JSON-LD `RealEstateListing`** per available unit: `@type`, `name`, `address`, `numberOfRooms`, `floorSize`, `price`, `priceCurrency`, `availableFrom`, `image`.
- `sitemap.xml` generated at build time from `buildings` + published `units`.
- `robots.txt` allowing all on production, disallowing all on preview deployments.

### Performance budgets
- Web Lighthouse Performance ≥ 80 mobile profile on Building page.
- LCP < 2.5s, INP < 200ms, CLS < 0.1 on a fast 4G profile.
- Hero photos served via Supabase image transform with `width=1600&quality=75&format=webp`; `<img loading="lazy">` for below-the-fold.

### Accessibility
- WCAG 2.1 AA target on web routes.
- All images have `alt_text` (required column, not nullable).
- axe-playwright in CI fails the build on AA violations on the four marketing routes.
- Tab order, focus rings, keyboard-completable forms.

---

## 9. Deployment & Environments

### Environments
| Env | Web | Mobile | Supabase project |
|---|---|---|---|
| **dev** (per-developer local) | `pnpm dev` (rspeedy dev server) | Simulator/emulator | shared `ar-mgmt-dev` Supabase project |
| **preview** (per-PR) | Vercel preview URL | n/a | shared `ar-mgmt-dev` |
| **staging** | `staging.ar-management.example` | TestFlight / Play Internal | `ar-mgmt-staging` Supabase project |
| **production** | `ar-management.example` | App Store / Play Store production | `ar-mgmt-prod` Supabase project |

### CI/CD (GitHub Actions)
- **PR open / push:** lint, typecheck, Vitest, Playwright (against preview Vercel URL), axe-playwright. Block merge on red.
- **Merge to `main`:** Vercel deploys web automatically. Supabase migrations applied via `supabase db push` against `ar-mgmt-staging`. Manual promotion to `ar-mgmt-prod`.
- **Mobile releases:** triggered manually via `eas build --platform all --profile production`, then `eas submit`.

### Secrets
- Vercel env vars for web client (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, Sentry DSN, Turnstile site key).
- EAS secrets for mobile clients (same set).
- Supabase Vault for service role key, Resend API key, Turnstile secret key (used inside Edge Functions only).
- **Never** commit any key to git; pre-commit hook (gitleaks) blocks accidental commits.

---

## 10. Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure logic: form validators (Zod schemas), slot-availability computation, ref-id generation, RLS policy SQL via `pgTAP` if time allows |
| Integration | Supabase CLI + Vitest | Spin up local Supabase, run migrations, exercise Edge Functions with fake payloads |
| E2E web | Playwright (Chromium + WebKit + Firefox) | Three golden paths: browse listings, submit showing request, submit maintenance request (with photo upload) |
| Accessibility | axe-playwright | Marketing routes: Home, Building, Listings, Unit |
| Mobile QA | Manual checklist | Per release: each golden path on 1 iOS device + 1 Android device |
| Performance | Lighthouse CI (web) | Building page mobile profile ≥ 80 |

No flaky-test tolerance: a failing test blocks merge; quarantine is not allowed.

---

## 11. Observability

- **Sentry**: web + iOS + Android. Capture client errors, network failures, slow operations. Source maps uploaded per release.
- **Supabase Logs**: query the `auth`, `database`, `storage`, `edge-functions` log streams from the dashboard. No external log aggregator in v1.
- **Resend dashboard**: monitor email delivery / bounces.
- **Uptime**: BetterStack or Vercel native uptime check on `/api/health` (a tiny Edge Function returning DB connectivity status). Alerts to manager email + Slack/Discord webhook.

---

## 12. Out of Scope (explicit YAGNI)

The following are deliberately **not** in v1. Each is its own future sub-project:

1. Tenant accounts, lease documents, lease-renewal flows.
2. Online rent payments (Stripe Connect, Plaid, ACH).
3. Trust accounting, owner statements, 1099 e-filing.
4. Application & screening forms (TransUnion, Experian).
5. AI assistants (lease Q&A, maintenance triage chatbot).
6. SMS notifications (Twilio).
7. Calendar-sync for showings (Google/Outlook).
8. Multi-language / i18n.
9. Native admin UI inside the Lynx app.
10. Background queue (BullMQ, etc.) — Edge Functions cover all v1 async work.

---

## 13. Risks & Open Questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Lynx web SSR/SEO viability is unproven.** | Step 0 spike validates; fallback is static prerender of four marketing routes. If both fail, escalate to user about adding a tiny separate Astro site for SEO routes (acknowledged contradiction with single-codebase choice). |
| R2 | **Lynx + supabase-js compatibility** in the Lynx JavaScript runtime. | Spike: `await supabase.from('buildings').select('*')` from iOS sim, Android emu, web. |
| R3 | **Lynx native camera/photo-picker** module may not exist. | Spike: pick + upload one photo per platform. If missing, write a thin native module (1–2 days each) or use a community module. |
| R4 | **App Store / Play Store review** of a Lynx app — limited precedent. | Submit a TestFlight build early in the project (Week 2) to surface any rejection. |
| R5 | **Domain & branding** unspecified. | User to confirm production domain (`ar-management.com`?) and brand assets before launch. Tracked as `OPEN-1`. |
| R6 | **Manager email allowlist** unknown. | Collect 3–5 actual manager emails before staging. Tracked as `OPEN-2`. |
| R7 | **Real photos for both buildings** unknown. | User to provide existing assets or commission a photographer. Tracked as `OPEN-3`. |
| R8 | **Anonymous photo upload abuse**. | Cloudflare Turnstile CAPTCHA + 5-photo, 10-MB limit + signed URLs scoped to one request id. |
| R9 | **Manual showing reschedule emails** are a v1 hack. | Acceptable at ~10/month for two buildings; revisit when volume justifies automation. |

### Open items requiring user input before launch
- **OPEN-1:** Production domain.
- **OPEN-2:** Manager email allowlist.
- **OPEN-3:** Building photos + brand assets.
- **OPEN-4:** Apple Developer + Google Play developer accounts ($99/yr + $25 one-time) — need credentials/access.
- **OPEN-5:** Resend account + sending domain DNS records.

---

## 14. Implementation Phasing (high level)

The implementation plan (next document) will turn this into ordered, reviewed steps. The shape:

1. **Step 0 — Lynx spike (48h, hard gate).** Render hello-world iOS + Android + Web. Fetch from Supabase. Upload one photo. Verify SSR/prerender. **Decision point:** continue or swap to Approach 2 (Hono + Neon).
2. **Step 1 — Foundations.** Repo, monorepo layout (or single rspeedy project), CI pipeline, env config, Sentry wired, Supabase project provisioned, migrations + seeds in place.
3. **Step 2 — Read-only public site.** Buildings + units rendered from Supabase, listings filter, photo galleries, SEO meta, sitemap. Lighthouse ≥ 80.
4. **Step 3 — Maintenance request flow.** Form, validation, Turnstile, signed-URL upload, Edge Function, Resend templates, confirmation screen.
5. **Step 4 — Schedule-a-showing flow.** Slots model, slot picker UI, fallback "preferred dates", Edge Function notification.
6. **Step 5 — Manager workflow polish.** Studio shortcut views, allowlist trigger, audit log triggers, manager-facing daily digest email.
7. **Step 6 — Mobile release prep.** EAS Build configs, App Store + Play Store metadata, screenshots, TestFlight + Play Internal.
8. **Step 7 — Launch.** Promote to prod Supabase, point production DNS, submit App Store + Play Store, run final QA matrix.

Total target: **5–7 weeks** from kickoff, assuming the Step 0 spike passes.

---

## 15. Appendix — Repo Layout (proposed)

```
AR_management/
├── AR.md                                     # research doc
├── docs/
│   └── superpowers/specs/2026-05-03-ar-management-public-site-design.md   # this file
├── apps/
│   └── lynx/                                  # rspeedy-scaffolded Lynx app
│       ├── src/
│       │   ├── routes/                        # screens / web routes
│       │   ├── components/
│       │   ├── lib/supabase.ts
│       │   ├── lib/queries.ts                 # TanStack Query hooks
│       │   └── schemas/                       # Zod
│       ├── tests/
│       └── package.json
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── functions/
│       ├── notify-on-new-request/
│       └── request-upload-urls/
├── packages/
│   └── shared/                                # Zod schemas, shared types
├── .github/workflows/
│   ├── ci.yml
│   └── deploy-web.yml
├── eas.json
├── pnpm-workspace.yaml
└── turbo.json
```

(If the Lynx project does not adopt cleanly into a Turborepo workspace, collapse `apps/lynx` into the repo root and keep `supabase/` and `packages/` siblings.)

---

**End of design.**
