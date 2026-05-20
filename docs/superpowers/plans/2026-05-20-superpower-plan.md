# AR Management — Superpower Plan
**Date:** 2026-05-20
**Status:** Draft (awaiting approval to execute)
**Source:** Synthesis of 20 parallel audits (security, performance, a11y, SEO, schema, API, UI/DS, mobile, tests, CI/CD, edge functions, email, finance, tenant portal, admin, listings, maintenance, showings, observability, docs/meta)

---

## 0. TL;DR

The AR Management app is a credible MVP with a clean Astro + Supabase backbone, but it has **critical security exposure** in production (hardcoded admin creds, non-HTTPOnly cookies, overpermissive RLS), **most of the business logic runs on in-memory fixtures** (no `tenants`/`leases`/`charges`/`payments`/`messages` tables yet, despite the UI), and **observability is effectively zero**. Closing those three gaps is non-negotiable before any feature work.

Past those, the highest-leverage *superpower* features are:

1. **Stripe ACH rent collection** — turns the finance system from a demo into a business.
2. **Applicant→Lease pipeline + e-sign + screening** — compresses the entire leasing process into one workflow.
3. **AI lease Q&A (RAG over uploaded lease PDFs)** — defensible differentiator no competitor ships well.
4. **Calendly-style live showing picker w/ Google Calendar sync** — converts more prospects.
5. **Design tokens + dark mode + component primitives** — unlocks the next 6 months of UI velocity.

Everything else hangs off those.

---

## 1. Critical Fixes (P0 — do this week, in order)

These must land before anything else. Several are real security incidents waiting to happen.

| # | Item | File(s) | Effort | Why P0 |
|---|------|---------|--------|--------|
| C1 | Replace hardcoded admin creds (`admin`/`admin`) with hashed creds + env-driven seed | `apps/web/src/lib/auth.ts:31` | 2h | Anyone can become admin |
| C2 | Set `httpOnly: true` and `secure: true` on auth cookies | `apps/web/src/lib/auth.ts:19-20` | 15m | XSS → full session theft |
| C3 | Remove plaintext tenant passwords from `tenant-fixtures.ts`; hash on first login | `apps/web/src/lib/tenant-fixtures.ts` | 1h | Plaintext creds in repo |
| C4 | Tighten RLS on `buildings`/`units`: drop blanket `using (true)`, scope by role | `supabase/migrations/20260503001100_rls_policies.sql:16,22` | 2h | Any authed user can mutate any building |
| C5 | Validate webhook calls into `notify-on-new-request` (Bearer token from service-role or HMAC) | `supabase/migrations/20260503001300_notify_webhooks.sql:15`, `supabase/functions/notify-on-new-request/index.ts` | 1h | Open endpoint accepts any payload |
| C6 | Add structured logger + request IDs + Sentry `captureException` on critical paths | `apps/web/src/lib/logger.ts` (new), `astro.config.mjs` | 3h | We are flying blind in production |
| C7 | Enforce GitHub branch protection on `main` (required checks + 1 review) | repo settings | 5m | Anyone with push access bypasses CI |

**Stop the line** on these. Estimated total: ~1 day of focused work.

---

## 2. Foundation Work (P1 — next 2 weeks)

These unlock everything else. Each is small-to-medium and independent enough to parallelize.

### F1. Persist the real data model
The UI implies tables that don't exist. Add migrations for: `tenants`, `leases`, `charges`, `payments`, `messages` (+ `notifications` and `email_events` while we're here). Match the shapes already used in fixtures. Move `tenant-fixtures.ts` / `finance-fixtures.ts` reads to Supabase queries; keep fixtures as the *degraded-mode* fallback (already wired up in `data.ts`). **~3 days.**

### F2. Unified API handler (validation + error shape)
Single `apiHandler(schema, handler)` in `apps/web/src/lib/api-handler.ts`. Standard error shape `{ error, code, issues? }`. Refactor all 5 API routes onto it. Adds request-ID logging for free. **~4h.**

### F3. Design tokens + primitives
`src/styles/tokens.css` (colors, spacing, radii, typography). `src/components/primitives/`: `Button`, `Card`, `FormField`, `Badge`, `Alert`. Refactor `BuildingCard`/`UnitCard` to compose `Card`. Collapse three near-identical form-input class strings. **~1 day.** *(Blocks dark mode, comparison view, polish work.)*

### F4. Hybrid rendering + cache headers
Set `prerender: true` on `index`, `about`, `privacy`, `terms`, `contact`. Use `revalidate` for `buildings/[slug]` and `units/[id]` (30–60 min). Add `Cache-Control` headers in `vercel.json` for `/public/*` (immutable) and listing pages (s-maxage). **~3h.** Expected TTFB drop: ~450ms → ~50ms on marketing pages.

### F5. Fix N+1s + tighten Supabase selects
- `finance-data.ts:148–154` (`getRentRoll`): pre-build tenant + charge maps. O(n²)→O(n).
- `data.ts:119`: replace `select('*')` with explicit columns.
- Add indexes on `showing_requests(building_id, unit_id)`, `maintenance_requests(assigned_to)`, `availability_slots(unit_id)`. **~2h.**

### F6. Test scaffolding
- pgTAP migration that asserts each RLS policy (anon read public, authed cannot mutate others', etc.) — 8 policies, ~30 min each.
- Vitest tests for `apiHandler`, `escapeHtml`, email rendering, degraded-mode fallback.
- Playwright: showing-submit spec mirroring the existing maintenance-submit. **~1.5 days.**

### F7. Observability baseline
- Enable Sentry (already installed) with the request-ID middleware from F2.
- `/api/health` extended to check Resend + Supabase + return per-dependency latency.
- Better Stack synthetic monitor against `/api/health` every 2 min, page on `degraded:true` or 5xx.
- Audit-log viewer page at `/admin/audit` (the table is populated but nothing queries it). **~1 day.**

---

## 3. Superpower Features (P2 — the next quarter)

Sequenced so each unlocks the next. Each is sized for a single dedicated agent in an isolated worktree.

### S1. Stripe ACH rent collection ⭐
**Why this is #1:** the entire finance module is currently a fixture demo. ACH is 2–3% cheaper than cards, supports recurring billing, and turns paid charges into reconciled audit-trail events.

- Stripe SetupIntent for ACH mandate at lease signing.
- PaymentIntent per charge; webhook → mark charge paid, emit receipt email.
- Auto-pay toggle on `/portal/payments`.
- Late-fee rules engine (configurable per building).
- Backfill: `payments.stripe_payment_intent_id` column.

**Depends on:** F1 (real `payments` table). **Effort:** ~2 weeks.

### S2. Applicant → Lease pipeline ⭐
- New `applicants` table; Kanban `/admin/applicants` (Inquiry → Application → Screening → Lease-Ready → Signed).
- TransUnion SmartMove integration for screening (already named in `AR.md`).
- Dropbox Sign / DocuSign for lease e-sign; webhook flips `leases.signed_at`.
- Generate lease PDF from template, prefilled from applicant + unit.

**Depends on:** F1. **Effort:** ~3 weeks. **Biggest business impact** after Stripe.

### S3. AI lease Q&A (RAG) ⭐
The defensible differentiator. Tenant uploads (or admin attaches) the signed lease PDF; tenant asks natural-language questions and gets cited answers.

- `lease_documents` table + Supabase Storage bucket.
- Ingestion edge function: chunk PDF, embed via Claude/`text-embedding-3-large`, store in `pgvector`.
- `/portal/lease-qa` page (React island): question box, cited answer with section/page link.
- Server: retrieval → Claude with `cache_control` on the lease context for cheap follow-ups.

**Effort:** ~2 weeks. Pairs naturally with S2 (lease PDF arrives via the e-sign webhook).

### S4. Calendly-style showing picker + Google Calendar sync
- Replace "pick three preferred dates" with a live month/day grid.
- Sync each building's availability calendar (Google Calendar OAuth per manager).
- ICS attachment + reminder sequence (email at 24h, SMS at 1h via Twilio).
- Reschedule via signed token link.
- No-show flagging on the prospect record.

**Effort:** ~2 weeks. Doesn't depend on S1–S3, can run in parallel.

### S5. Notification preferences + smart batching
- `manager_preferences` table: quiet hours, batch threshold, urgency/issue/building filters.
- Refactor `notify-on-new-request` from fan-out to a 5-min coalescing queue.
- In-app notification center (`notifications` table + bell icon).
- React Email templates replacing the current HTML-string templates.

**Effort:** ~1 week. Eliminates current alert fatigue for managers.

### S6. Vendor dispatch + maintenance SLA
- `vendors` table + COI tracking (expiry alerts).
- Auto-dispatch on `urgency in ('high','emergency')`: SMS to vendor with photo + portal deep-link.
- SLA columns: `acknowledged_at`, `started_at`, `completed_at`; dashboard with on-track/warning/breached.
- Tenant-facing status thread (replaces opaque `manager_notes` text field).
- Satisfaction survey email on `resolved`.

**Effort:** ~2 weeks.

### S7. Public site conversion lift
- Save-to-favorites (localStorage; sticky comparison drawer).
- Comparison view (2–3 units side-by-side).
- Map view (Mapbox) — building + unit pins.
- Building hero images served as `<picture>` srcset (drop 3.9MB PNGs → ~400KB AVIF/WebP).
- ApartmentComplex JSON-LD on building pages (currently only unit-level Apartment schema). Local SEO multiplier.

**Effort:** ~1.5 weeks.

### S8. Design system v2
Built on F3.
- Dark mode toggle + `prefers-color-scheme` fallback.
- Photo lightbox upgrade (keyboard nav, pinch-zoom).
- Interactive floor plans (SVG with room highlights) — phase-2 stretch.

**Effort:** ~1 week (dark mode), +1 week (lightbox + floor plans).

### S9. PWA instead of reviving Lynx
Recommendation from the mobile audit: archive `apps/lynx/`, ship a PWA from the Astro app.
- `astro-pwa` integration, manifest, service worker.
- Offline queue for maintenance requests.
- Web Push for status updates (replaces the SMS path for installed users).
- Install prompts on portal routes.

**Effort:** ~3 weeks. Saves ~12 weeks vs. native rebuild.

### S10. Cross-cutting AI helpers
- Listing description writer (`unit + photos → SEO-friendly copy`, Claude API).
- Maintenance triage (auto-classify issue_type + flag urgency mismatch).
- Rent comp analysis (Rentometer API → "your rent vs. market" badge).

**Effort:** ~1.5 weeks combined. Low-risk, high-delight.

---

## 4. Schema Additions (folded into F1 + S-series)

New tables (canonical home for each is the migration introduced by the feature that needs it):

- `tenants` (F1)
- `leases` (F1) — must include `signed_at`, `auto_renew`, `notice_period_days`
- `charges` (F1) — `status`, `due_date`, `stripe_payment_intent_id` later (S1)
- `payments` (F1) — `method`, `stripe_payment_intent_id` (S1)
- `messages` (F1) — threaded; `from_role`, `read_at`
- `notifications` (S5) — in-app, per-user
- `email_events` (S5) — Resend webhook landing
- `applicants` (S2)
- `vendors`, `work_orders`, `vendor_insurance` (S6)
- `manager_preferences` (S5)
- `lease_documents` + `pgvector` column for embeddings (S3)
- `audit_events` (replaces `audit_log`; structured `old_value`/`new_value`/`changed_fields`)

All new tables get: `created_at`/`updated_at`/`deleted_at`, RLS policy + pgTAP test in the same migration.

---

## 5. Execution strategy

### Sequencing
```
Week 1:  C1–C7 (security + observability stop-the-line)
Week 2:  F1 (schema) ─┬─ F2 (api handler) ─┬─ F3 (design tokens)
                     ├─ F4 (hybrid render) │
                     ├─ F5 (perf fixes)    │
                     └─ F6 (tests) ────────┘
Week 3:  F7 (observability) + start S1, S2, S4 in parallel worktrees
Week 4–6: S1, S2, S3, S4 complete; S5/S6 start
Week 7–9: S5, S6, S7, S8 complete; PWA + AI helpers
Week 10:  Cleanup, docs, ADRs, archive lynx/
```

### Parallelization rules
- **P0 fixes are sequential** (touch the same files, security-critical).
- **F1 schema is sequential** with everything that reads from those tables. Do it first.
- **F2/F3/F4/F5/F6/F7 can fan out** to up to 6 worktree agents — they touch different surfaces.
- **S-features fan out to one worktree per S-item**, but S1/S2/S3 share the `leases` table — coordinate via PR review, not concurrent edits.

### Definition of done (per item)
- Code + Vitest unit tests + Playwright happy-path (where UI exists)
- pgTAP test for any new RLS policy
- Sentry breadcrumbs on every new error path
- README / runbook section if the operator interacts with it
- One-line entry in `docs/superpowers/plans/CHANGELOG.md` (to be created)

---

## 6. Docs work (rolled into the schedule, not a phase)

- ADR-001: Lynx → Astro pivot (formalize SPIKE-NOTES.md)
- ADR-002: Decision to skip Stripe Cards in favor of ACH-first (when S1 lands)
- ADR-003: RAG architecture choice (when S3 lands)
- `docs/architecture/erd.md` — generated from migrations
- `docs/architecture/system.md` — Astro → CF Worker → Supabase → Resend diagram
- `apps/web/AGENTS.md` (currently only `apps/lynx/AGENTS.md` exists)
- Consolidate `runbooks/launch.md` + `pre-launch.md` + `mobile-qa.md` into one phased runbook

---

## 7. Explicitly out of scope (for now)

These came up in audits but are deferred:
- White-label multi-tenancy / organizations table — premature; no second customer.
- Matterport / 3D tours — content creation cost > engineering value at 2 buildings.
- Native iOS/Android via Expo — PWA covers it; revisit if install rates demand it.
- GraphQL layer / public API — no consumer yet.
- Eviction tracker — needed eventually but state-compliance-heavy; do after we have a real attorney in the loop.

---

## 8. Open questions for the operator

1. **Stripe Connect or direct Stripe?** Connect lets you split funds across multiple LLCs (one per building); direct is simpler if both buildings flow into one account.
2. **Who hosts lease PDFs?** Supabase Storage (cheap, RLS-friendly) vs. S3 (industry standard for legal docs).
3. **Twilio for SMS or stay email-only?** SMS unlocks showing reminders + vendor dispatch but adds ~$30/mo + spam-rules complexity.
4. **Bilingual site priority?** Spanish ROI is real for Chicago; Russian is niche. Worth doing now or after MVP-2?
5. **Sentry plan?** Free tier covers low traffic but rate-limits on bursty webhook failures. Budget?

Answers to these change the order of S1, S3, S4, S5.

---

*This plan is the synthesis of 20 parallel audits. Source agent reports are not persisted but the findings here are exhaustive. Next step: operator approves a slice, then we fan out implementation agents in isolated worktrees per S- or F- item.*
