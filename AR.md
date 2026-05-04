# Property Management Platforms in 2025–2026 + the Best JS/TS Stack to Build a Custom One

## TL;DR
- **Best off-the-shelf platform overall: DoorLoop** for most operators (10–5,000 units, mixed residential/commercial), with **AppFolio** as the right answer for 200+ unit professional managers and **Yardi Voyager / RealPage** for institutional 1,500+ unit enterprise portfolios; **Buildium** remains the value choice for HOAs and small residential portfolios, and **TurboTenant** wins for free DIY landlords with under ~10 units.
- **Best JS/TS stack to build a custom production-grade property management app: Next.js 15/16 (App Router) on Node.js 22 LTS + NestJS (Fastify adapter) for the API + PostgreSQL on Neon + Drizzle ORM + Clerk for auth + Stripe Connect for rent/ACH + Resend for email + a queue (BullMQ on Upstash Redis) — deployed with Vercel for the frontend and Railway or Fly.io for the backend.** This combination optimizes for type safety, hiring depth, real-time capability, and the multi-tenant + financial-trust requirements that define this domain.
- The category is consolidating around AI-native automation: RealPage launched Lumina AI Workforce in June 2025, AppFolio shipped Realm-X agentic workflows, DoorLoop added an AI Assistant in late 2025, and Funnel Leasing processed its first rent payment via ChatGPT in 2025–2026 — meaning any new platform you build must treat AI agents and embedded fintech (Stripe Connect, Plaid) as table stakes, not bonuses.

---

## Key Findings

### Property Management Platforms (2025–2026)

The global property management software market was approximately $7.1B in 2025 and is forecast to reach $17.1B by 2035 at ~9.3% CAGR (Research Nester); North America accounts for ~36–40% of revenue and the U.S. holds ~74% of the regional share (Grand View Research). RealPage leads with ~13.4% market share, followed by Yardi, CoStar Group, and AppFolio (Apps Run The World, 2024 data).

The competitive map breaks cleanly into four tiers:

1. **Enterprise / institutional (1,500+ units):** Yardi Voyager, RealPage OneSite, MRI Software, Entrata. Custom pricing (typically tens of thousands per month), 6+ month implementations, deepest revenue management and compliance tooling.
2. **Professional mid-market (50–1,500 units):** AppFolio, Buildium, DoorLoop, Rent Manager, Propertyware, ResMan. Per-unit pricing $1–$5/unit/month, full accounting, mobile apps, embedded payments.
3. **Small landlord / SMB (1–50 units):** TurboTenant, Innago, Avail, RentRedi, TenantCloud, Hemlane, Baselane. Free or sub-$50/month, marketing-first, simpler accounting.
4. **Vertical specialists:** Yardi Breeze (affordable housing/HUD/LIHTC compliance), Guesty/Hostfully (vacation rentals), Property Meld (maintenance only), AppFolio Investment Manager (real-estate funds).

The single biggest market disruption is regulatory: **on November 24, 2025 the DOJ filed a proposed 7-year consent settlement with RealPage** over its YieldStar/AI Revenue Management algorithmic price-coordination practices. Per the DOJ press release, RealPage must "cease having its software use competitors' nonpublic, competitively sensitive information to determine rental prices" and "limit model training to historic or backward-looking nonpublic data that has been aged for at least 12 months," with a court-appointed monitor. Greystar (the largest U.S. landlord) had already settled in August 2025 for $50M class + $7M states. RealPage denies wrongdoing but installed a new CEO (Dirk Wakeham) in November 2025. This materially shifts revenue-management product positioning — buyers (and software builders) should expect aggressive AI-pricing scrutiny for the next several years.

### Top platforms head-to-head (verified pricing as of early 2026)

| Platform | Starting price | Min units | Best fit | G2/Capterra rating | Notable strength | Notable weakness |
|---|---|---|---|---|---|---|
| **DoorLoop** | $69/unit‑bundle/mo (annual) | None (Starter caps at 20) | 10–5,000 units, mixed portfolios | 4.8 G2 / 4.8 Capterra (top of 2025 + 2026 Capterra Shortlist) | Modern UX, fastest onboarding, AI Assistant resolves up to 80% of tenant queries | Pricing rises sharply with units; accounting depth weaker than Buildium |
| **AppFolio** | $1.49/unit/mo, **$298/mo minimum**, 50-unit minimum | 50 | 200+ units, professional managers, mixed asset types | 4.5 Capterra | Realm-X agentic AI, leasing AI assistant Lisa, deepest mid-market analytics | At <200 units the minimum makes effective per-unit cost $5.60+; opaque pricing |
| **Buildium** | $62/mo (Essential) | None | Small-to-mid residential, HOA/community associations | 4.4 G2 / 4.5 Capterra | Strong accounting, 1099 e-filing, HOA tooling | Reports rigid; recent Trustpilot complaints on pricing transparency and Vendoroo integration removal |
| **Yardi Breeze / Voyager** | Breeze $1/unit, $100 min; Breeze Premier $400 min; Voyager custom (enterprise) | 100 / enterprise | Affordable housing (HUD/LIHTC) for Breeze; 1,000+ units for Voyager | 4.1–4.3 Capterra | Compliance, multi-entity, deep verticals | Voyager UI dated; long implementation; limited public API |
| **RealPage OneSite + Yieldstar** | Custom enterprise | Enterprise | Institutional multifamily | n/a | Revenue management, market analytics, IoT | DOJ consent decree restricts algorithm; reputational drag |
| **Rentec Direct** | Pro $55/mo (landlord); PM $65/mo, $2/unit over 25 | 1 | Small-to-mid residential, QuickBooks-heavy users | 4.6 Capterra | Best QuickBooks integration; cash payment network | Older UI; thinner CRM |
| **TurboTenant** | Free; Pro $9.92/mo annual; Premium $12.42/mo annual | 1 | DIY landlords, 1–10 units | 4.5+ user reviews | Best free tier; Realtor.com listing exposure | Costs deferred to tenants; no advanced accounting |
| **Innago** | Free | 1 | DIY landlords | 4.9 G2 | Highest-rated free option | Lacks deep reporting at scale |
| **Propertyware** | $1/unit, $250 min + 2× setup fee | ~250 | Single-family (200+ units) | 3.9 Capterra | Customizable, trust accounting | Aging UX; expensive minimum |
| **Rent Manager** | $1/$1.75/$2.50 per unit/mo | n/a | Mixed/commercial, integration-heavy | 4.5 Capterra | 160+ third-party integrations | Steeper learning curve |
| **Entrata** | Custom enterprise | Large multifamily/student | 4.6 Capterra | Open API, all-in-one for student housing | Enterprise pricing only |
| **MagicDoor** | $2.50/active lease/mo + $2.49/ACH | 1 | Modern AI-native challenger (launched Oct 2024) | New, limited reviews | Lowest per-unit price, AI-native | Young product, limited track record |

### AppFolio is the public-company benchmark
AppFolio (NASDAQ: APPF) reported **FY2024 revenue of $794.2 million (+28% YoY), 8.7 million units under management, and 20,784 property management customers as of December 31, 2024** (10-K filing). FY2025 revenue grew exactly 20% year-over-year to **$951 million**, per AppFolio's January 29, 2026 earnings press release: "Revenue grew 20% year-over-year to $951 million." It is the only pure-play public comparable and signals that the professional mid-market segment is the most lucrative and fastest-growing band of the market.

### DoorLoop is the momentum story
DoorLoop closed a **$100M Series B in October 2024 led by JMI Equity, bringing total funding to $130M and a reported ~$500M valuation** (DoorLoop press release; Calcalistech). It now sits at the top of Capterra's Shortlist for two years running with a 4.8/5 user rating. Co-founder/CEO Ori Tamuz has positioned the product as the "modern Buildium" — a stance reinforced by monthly feature releases and Stripe-powered RapidRent payments.

### Verdict on which platform to buy

| You are… | Recommendation |
|---|---|
| Solo landlord with 1–10 doors, want free | **TurboTenant** (or Innago if you want full-featured free) |
| 10–50 doors, growing | **DoorLoop Starter or Pro** — best UX-to-price ratio; will scale to 5,000 units |
| 50–500 doors, professional manager, mixed residential | **DoorLoop Pro/Premium** *or* **AppFolio Core** — DoorLoop wins on price/UX, AppFolio wins on automation depth and AI |
| 500–1,500 doors, professional manager | **AppFolio Plus** (Realm-X automation worth the premium) |
| 1,500+ doors, institutional, revenue management | **Yardi Voyager** (post-DOJ-settlement, lower regulatory risk than RealPage) |
| HOA / community association heavy | **Buildium** or **AppFolio Core (Association)** |
| Affordable / HUD / LIHTC compliance heavy | **Yardi Breeze Premier** or **RealPage OneSite Affordable** |
| Vacation rental | **Guesty** or **Hostfully** (not covered above; different category) |
| QuickBooks-centric workflow | **Rentec Direct** |

---

## The Best JS/TS Stack for a Custom Property Management Platform

A property management application is essentially a **multi-tenant financial system with rich workflows** (leases, recurring rent, ACH/card payments with PCI scope, maintenance work orders with photo uploads, owner statements, 1099 reporting, document e-signature, real-time tenant chat). That puts hard constraints on the stack: strong typing across boundaries, transactional database semantics, background jobs, real-time updates, secure auth with org/role isolation, and audit trails.

### The recommended stack (decision-ready)

**Runtime & Language:** **Node.js 22 LTS + TypeScript 5.x.** Use Bun (1.3) for local development and tooling (faster installs and tests) but stay on Node.js for production. Bun has reached ~98% Node API compatibility and Anthropic acquired it in December 2025, but for a 5+ year financial system, V8's GC track record on long-running processes and Datadog/APM ecosystem maturity still tip the scale. Hybrid is the lowest-risk path.

**Backend framework: NestJS with the Fastify adapter.** Independent benchmarks show Fastify delivers ~2–4× the throughput of Express (~76,000 RPS vs ~38,500 RPS in DrCodes 2025 benchmarks; Medium's NestJS comparison saw 50K RPS with Fastify vs 17K with Express at 200 concurrent connections). NestJS gives you enforced module boundaries, dependency injection, decorators, and built-in support for guards (authn/authz), interceptors (audit logging), and validation pipes — exactly what you need for a system that will grow past 100k LOC and where contractors and new hires must avoid breaking trust accounting. NestJS is strictly slower per-RPS than raw Fastify due to DI overhead, but property management workloads are dominated by database I/O, not framework overhead, so the architectural payoff dwarfs the cost.

If you are a 1–2 person team optimizing for time-to-MVP, **Hono on Bun** or **Fastify alone** with a clear feature-folder layout is also defensible. Skip Express for greenfield work in 2026.

**Frontend: Next.js 16 (App Router) + React 19.** State of JS 2024 still shows Next.js dominating React meta-framework usage. For a property management product you'll need a marketing site, an admin dashboard, a tenant portal, and an owner portal; Next.js's hybrid rendering (PPR, RSC, server actions) maps perfectly to that mix. Remix/React Router v7 is a strong runner-up if your app is *all* dashboard with heavy form mutations — Shopify Engineering reports that adopting Remix patterns produced exactly a "30% improvement in perceived load times" across admin.shopify.com's 67 million daily page views (shopify.engineering/remixing-admin, 2025). SvelteKit produces dramatically smaller bundles and the highest developer-satisfaction scores, but the React talent pool is 5–10× deeper, which matters for a multi-year financial product where you need to hire reliably.

**ORM: Drizzle for new builds; Prisma if your team is mostly junior on SQL.** Prisma 7.0.0 shipped on November 19, 2025, replacing its Rust query engine with a TypeScript/WASM Query Compiler — bundle dropped from ~14 MB to ~1.6 MB (a 90% reduction), and per Prisma's official benchmarks `findMany` over 25,000 records improved from 185 ms to 55 ms (a 3.4× peak speedup), while complex joins improved from 207 ms to 130 ms (1.6×). That closes most of the historical gap with Drizzle. But Drizzle is still smaller (~7KB), faster on cold starts, and gives you SQL-shaped types you can audit. For a financial domain where you will write complex JOINs over leases × charges × payments × ledger entries, **Drizzle's SQL-first model is the better long-term fit**. Use Drizzle Kit for migrations with `strict: true` to prevent silent column-rename data loss.

**Database: PostgreSQL on Neon (or Supabase).** Vanilla Postgres with logical replication, partitioning, JSONB for document metadata, and `pgvector` for AI features (lease summarization, anomaly detection). Neon's branching and scale-to-zero make CI/CD preview environments cheap; Databricks announced its acquisition of Neon on May 14, 2025 for approximately $1 billion (CNBC, TechCrunch), and per Vantage's pricing tracker, "after the Databricks acquisition in May 2025, Neon dropped compute prices 15–25% and slashed storage from $1.75 to $0.35/GB-month" (an 80% reduction introduced in August 2025). HIPAA eligibility is now available on the Scale plan. Supabase is the better choice if you also want auth, storage, and realtime in one platform from day one. For enterprise compliance/data-residency, AWS RDS or Google Cloud SQL.

**Auth: Clerk for B2C/SMB; Auth0 if you must close enterprise SSO/SAML deals; Supabase Auth if you went all-in on Supabase.** Clerk's pre-built `<SignIn />`, `<UserButton />`, and Organizations components implement multi-tenant RBAC in a half-day, integrate cleanly with Supabase RLS via JWT claims, and price at ~$0.02/MAU after 10K free. Auth0 is more mature for SAML and HIPAA BAAs but ~3× the price. **Do not roll your own auth** in this domain — the 2024 Verizon DBIR (10,626 confirmed breaches across 94 countries) found stolen credentials were the #1 initial action in 24% of breaches and accounted for 77% of Basic Web Application Attacks (Verizon DBIR p.18, via SpyCloud analysis).

**Payments: Stripe Connect (Standard or Custom accounts) + Plaid for ACH/bank verification.** Stripe Connect is what DoorLoop, Re-Leased, ManageCasa, RentRedi, MagicDoor, and TenantCloud all use; Re-Leased reported 90% YoY payment volume growth after embedding Stripe Pay. ACH typically settles in 2 days; cards in seconds. Use Stripe Issuing if you ever want owner debit cards. Build owner-level disbursements as Stripe Connect transfers so funds never sit in your operating account (critical for state trust-accounting compliance).

**Real-time (maintenance chat, work-order status, payment confirmations):** Native WebSockets in NestJS (`@nestjs/platform-fastify` + `@fastify/websocket`) or **Pusher Channels / Ably** as a managed alternative. Supabase Realtime is also acceptable if you're on Supabase. Avoid custom socket server clusters until you exceed ~50K concurrent connections.

**Background jobs: BullMQ on Upstash Redis.** Property management is full of scheduled and asynchronous work: nightly rent posting, late-fee assessment, lease-renewal reminders, document generation, email/SMS, accounting reconciliation, 1099 generation each January. BullMQ gives you delayed jobs, repeatable jobs, rate limiting, and dead-letter handling with first-class TypeScript types.

**Document handling: AWS S3 (or Cloudflare R2 for ~80% cheaper egress) + uploadthing for client uploads + react-pdf for owner statements.** For e-signature use **DocuSign API** or **Dropbox Sign** rather than building it; legal enforceability of leases requires audit trails most teams should not own.

**Email/SMS: Resend (transactional email, React Email templates) + Twilio (SMS).** SendGrid and Postmark are equally fine.

**Observability: Sentry (errors) + Datadog or BetterStack (logs/APM/uptime) + PostHog (product analytics).** Audit logging into a separate Postgres schema is mandatory for trust accounting; never delete financial events, only soft-flag with `voided_at`.

**Hosting:**
- **Frontend (Next.js):** Vercel for ≤$200/mo plan tier; once team reaches ~5 people or bandwidth exceeds ~1TB, evaluate Cloudflare Pages + Workers (via OpenNext) or self-host on a VPS — at scale Vercel can run 5–10× the cost of Railway or a Hetzner VPS.
- **Backend (NestJS API + workers):** **Railway** for $20–$200/mo at typical SMB load (best DX, integrated Postgres + Redis), or **Fly.io** if you need globally distributed instances or persistent WebSockets. Avoid putting a NestJS API on Vercel functions; long-lived processes and WebSockets are awkward there.
- **Enterprise / compliance path:** AWS ECS/Fargate behind ALB, RDS Multi-AZ Postgres, ElastiCache Redis, with Terraform/Pulumi IaC.

**Monorepo: Turborepo + pnpm workspaces.** Share types between Next.js, NestJS, and a future React Native (Expo) tenant app via a `packages/shared` library. Use Zod schemas as the single source of truth for runtime validation + TS types.

**Testing: Vitest (unit) + Playwright (E2E) + Testcontainers (Postgres integration tests).**

### Why this stack and not the alternatives

- **Why not T3 stack (tRPC + Next.js)?** tRPC is fantastic for internal-only TS-to-TS apps but property management requires open APIs (mobile app, owner portal integrations, third-party accounting exports, partner integrations like TransUnion/Plaid/QuickBooks). REST + OpenAPI (NestJS generates OpenAPI automatically) is a better choice; layer tRPC on top of NestJS only if you want the DX gains internally.
- **Why not Django/Rails?** Both are excellent and arguably faster for a solo-founder MVP (Rentec Direct, Stessa, Avail are largely Rails). The reason to choose JS/TS is **shared types and hiring depth**: you write the schema once in Drizzle/Zod and consume it on web, server, mobile, and AI agents. JS/TS also has the strongest LLM coding-agent support in 2026 (Claude Code, Cursor, v0), which materially accelerates greenfield delivery.
- **Why not Supabase as the whole backend?** Supabase + Next.js can ship a v1 in weeks. The problem is the financial-system requirements (trust accounting, multi-currency journals, idempotent payments, reversible transactions, complex permissions across owner/manager/vendor/tenant) outgrow Postgres RLS + edge functions before you hit 100 customers. Use Supabase for auth, file storage, and realtime; put core business logic in NestJS.
- **Why not Bun in production?** Bun in production is now plausible (Anthropic's December 2025 acquisition adds runway, ~98% Node compat, Lambda cold starts cut ~50%). But a financial system runs for months between deploys, and V8 has 15+ years of long-running GC tuning that JavaScriptCore doesn't. Use Bun for tooling; revisit production runtime in 12 months.

### Reference architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Vercel Edge (Next.js 16 App Router)                          │
│  - Marketing site, admin, tenant portal, owner portal        │
│  - Clerk auth                                                │
│  - Server Components for read paths; calls API for writes    │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTPS (REST + OpenAPI), JWT from Clerk
┌──────────────────▼──────────────────────────────────────────┐
│ Railway / Fly.io                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐ │
│  │ NestJS API    │  │ NestJS Worker │  │ NestJS WebSocket │ │
│  │ (Fastify)     │  │ (BullMQ)      │  │ Gateway          │ │
│  └──────┬────────┘  └──────┬────────┘  └─────────┬────────┘ │
└─────────┼──────────────────┼───────────────────────┼────────┘
          │                  │                       │
   ┌──────▼──────┐    ┌──────▼──────┐         ┌──────▼──────┐
   │ Neon        │    │ Upstash     │         │ Pusher /    │
   │ Postgres    │    │ Redis       │         │ Ably        │
   │ + pgvector  │    │ (queues)    │         │             │
   └─────────────┘    └─────────────┘         └─────────────┘
          │
   ┌──────▼─────────────────────────────────────┐
   │ External: Stripe Connect, Plaid, TransUnion,│
   │ DocuSign, Twilio, Resend, S3/R2, Sentry,   │
   │ Datadog, OpenAI/Anthropic                  │
   └────────────────────────────────────────────┘
```

---

## Recommendations

### If you're **buying** a platform (in priority order):
1. **Map your portfolio to the four tiers above.** Unit count, asset mix (residential/HOA/affordable/commercial), and whether you bill owners (third-party manager vs DIY landlord) drive the answer more than features.
2. **Run a 14-day trial on DoorLoop and a paid pilot on AppFolio in parallel** if you're 50–500 units. Most teams pick DoorLoop on UX, but AppFolio's Realm-X automation pays for itself above 200 units.
3. **Avoid RealPage's revenue-management modules** for new contracts until the DOJ consent decree's behavior is clear in market — that doesn't mean avoid RealPage's accounting/CRM products, but do separate the modules.
4. **Insist on data export in CSV + a JSON/REST API** before signing. Migration costs are the silent killer of every PM platform contract.
5. **Switching threshold:** revisit the platform decision when (a) you cross 200 units (AppFolio's pricing-fairness threshold), (b) you add a new asset class your current tool doesn't handle natively, or (c) your effective per-unit cost exceeds 1.0–1.5% of monthly rent collected.

### If you're **building** a custom platform:
1. **Phase 1 (months 0–3, MVP for 1 customer/100 units):** Next.js + Clerk + Supabase (Postgres + Auth + Storage) + Stripe Connect + Resend. Skip NestJS; use Next.js Server Actions + a small set of Route Handlers. Goal: collect rent online, manage leases, receive maintenance requests.
2. **Phase 2 (months 3–9, 10 customers/2,000 units):** Extract the API into a NestJS (Fastify) service on Railway; add Drizzle migrations under strict mode; add BullMQ workers for accounting close, late fees, 1099s; add a tenant mobile app (Expo); add Plaid for ACH and TransUnion for screening.
3. **Phase 3 (months 9–18, 50+ customers/20,000+ units):** Move database to Neon Scale or AWS RDS Multi-AZ; add SOC 2 Type II program; add SAML SSO via Clerk Organizations or migrate auth to Auth0; add Datadog APM; ship AI features (lease summarization, maintenance triage, predictive late-payment) using OpenAI/Anthropic with retrieval over your own data.
4. **Trip-wires that should change the architecture:** crossing 50 concurrent WebSocket users per customer (move from polling to managed Pusher); crossing 100K MAU on auth (renegotiate Clerk pricing or self-host with better-auth/Lucia); crossing 1TB/month bandwidth on Vercel (move marketing site to Cloudflare Pages); first enterprise prospect that requires VPC isolation (move to AWS).
5. **Compliance benchmarks to plan for from day one:** PCI scope (let Stripe carry it), SOC 2 readiness (audit trails, access logs, encryption at rest — Drata or Vanta automation), state trust-accounting rules (segregated owner balances), 1099-MISC e-filing (use Track1099 API in January).

---

## Caveats

- **Vendor pricing changes constantly.** All numbers above are accurate as of early 2026, sourced from each vendor's pricing page or recent reviews on G2/Capterra/SoftwareAdvice; AppFolio's exact tiers in particular are not always public and require sales contact. Always pull a fresh quote.
- **AppFolio and Yardi do not publicly publish all tier pricing.** Effective per-unit costs at small portfolios are far higher than the advertised rate due to monthly minimums (AppFolio: $298–$7,500; Yardi Breeze: $100–$400; Propertyware: $250).
- **The RealPage DOJ settlement (Nov 24, 2025) is a *proposed* consent judgment** still pending Tunney Act court approval; some attorneys general (CA, CO, CT, IL, MA, MN, NC, OR, TN, WA) are pursuing separate state actions. The product behavior described in this report could change again.
- **Market-share figures conflict between sources** (Apps Run The World cites RealPage at 13.4%, Mordor at 40.27% North America regional; Enlyft cites Yardi at 10.42%). These are estimates from analyst firms with different denominators; treat directionally.
- **Bun, Drizzle, and Prisma 7** are evolving rapidly. Recommendations here reflect early-2026 stability; revisit before committing for a 5-year platform investment.
- **Ratings on review sites carry incentive bias.** DoorLoop, AppFolio, and Buildium all run incentivized review programs on G2 and Capterra (clearly disclosed but skews scores upward); Trustpilot scores tend to be lower (Buildium sits at 3.2/5 there) because they over-index on customer service complaints. Triangulate across at least three sources.
- **None of this constitutes legal, accounting, or investment advice.** Trust accounting, fair-housing screening rules, FCRA compliance, and state landlord-tenant laws vary significantly by jurisdiction and require domain counsel.
