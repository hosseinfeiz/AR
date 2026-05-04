# AR Management — Public Site & Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform (iOS + Android + Web) Lynx app for AR Management's two buildings (Grass Lake Manor, Winnetka Manor) covering public listings, schedule-a-showing intake, maintenance request intake, and a manager triage workflow via Supabase Studio.

**Architecture:** Single Lynx (rspeedy) codebase compiles to iOS, Android, and Web. Backend is Supabase (managed Postgres + Auth + Storage + Realtime + Edge Functions). Email via Resend. Manager admin in v1 = Supabase Studio (no custom admin UI). Single-tenant, no SaaS layer.

**Tech Stack:** Lynx + ReactLynx + rspeedy, TypeScript, Supabase (Postgres 15+, Auth, Storage, Edge Functions, Realtime), TanStack Query v5, react-hook-form + Zod, Resend + React Email, Sentry, Vercel (web), EAS Build (mobile), GitHub Actions (CI), Playwright + Vitest + axe-playwright (tests), pnpm + Turborepo (monorepo).

**Spec:** `docs/superpowers/specs/2026-05-03-ar-management-public-site-design.md`

**Pre-flight items the user must provide before launch (do not block dev work, do block production):**
- `OPEN-1` Production domain (assume `ar-management.example` until provided).
- `OPEN-2` Manager email allowlist (3–5 emails).
- `OPEN-3` Building photos and brand assets.
- `OPEN-4` Apple Developer ($99/yr) and Google Play developer ($25 one-time) account credentials.
- `OPEN-5` Resend account + verified sending domain.

---

## File Structure (locked before tasks)

```
AR_management/
├── AR.md                                          # research doc (exists)
├── README.md                                      # repo overview
├── package.json                                   # workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── eas.json                                       # mobile build profiles
├── .gitignore
├── .nvmrc                                         # node 22
├── .env.example
├── .github/workflows/
│   ├── ci.yml                                     # lint + typecheck + test
│   └── deploy-web.yml                             # vercel + supabase migrations
├── docs/superpowers/
│   ├── specs/2026-05-03-ar-management-public-site-design.md   # exists
│   └── plans/2026-05-03-ar-management-public-site-plan.md     # this file
├── supabase/
│   ├── config.toml
│   ├── seed.sql                                   # two building rows
│   ├── migrations/
│   │   ├── 20260503000100_init.sql
│   │   ├── 20260503000200_buildings.sql
│   │   ├── 20260503000300_units.sql
│   │   ├── 20260503000400_photos.sql
│   │   ├── 20260503000500_availability_slots.sql
│   │   ├── 20260503000600_showing_requests.sql
│   │   ├── 20260503000700_maintenance_requests.sql
│   │   ├── 20260503000800_audit_log.sql
│   │   ├── 20260503000900_managers_allowlist.sql
│   │   ├── 20260503001000_storage_buckets.sql
│   │   ├── 20260503001100_rls_policies.sql
│   │   └── 20260503001200_triggers.sql
│   └── functions/
│       ├── _shared/
│       │   ├── cors.ts
│       │   └── resend.ts
│       ├── notify-on-new-request/
│       │   ├── index.ts
│       │   └── templates/
│       │       ├── manager-notification.tsx
│       │       └── submitter-confirmation.tsx
│       ├── request-upload-urls/
│       │   └── index.ts
│       └── health/
│           └── index.ts
├── packages/shared/
│   ├── package.json
│   └── src/
│       ├── index.ts
│       ├── env.ts                                 # zod env schema
│       ├── schemas/
│       │   ├── building.ts
│       │   ├── unit.ts
│       │   ├── showing-request.ts
│       │   └── maintenance-request.ts
│       └── ref-id.ts                              # human-readable ref id
└── apps/lynx/
    ├── package.json
    ├── tsconfig.json
    ├── lynx.config.ts                             # rspeedy config
    ├── playwright.config.ts
    ├── vitest.config.ts
    ├── public/
    │   ├── robots.txt
    │   └── favicon.ico
    ├── src/
    │   ├── App.tsx                                # root, routes mount
    │   ├── lib/
    │   │   ├── supabase.ts
    │   │   ├── env.ts
    │   │   ├── queries.ts
    │   │   ├── analytics.ts                       # source detection
    │   │   ├── sentry.ts
    │   │   └── platform.ts                        # ios|android|web
    │   ├── components/
    │   │   ├── Layout/Header.tsx
    │   │   ├── Layout/Footer.tsx
    │   │   ├── Layout/TabBar.tsx
    │   │   ├── BuildingCard.tsx
    │   │   ├── UnitCard.tsx
    │   │   ├── PhotoGallery.tsx
    │   │   ├── FilterChips.tsx
    │   │   ├── ShowingForm.tsx
    │   │   ├── MaintenanceForm.tsx
    │   │   ├── PhotoUploader.tsx
    │   │   ├── TurnstileWidget.tsx
    │   │   └── SeoHead.tsx
    │   ├── routes/
    │   │   ├── home.tsx
    │   │   ├── building.tsx                       # /buildings/[slug]
    │   │   ├── listings.tsx
    │   │   ├── unit.tsx                           # /units/[id]
    │   │   ├── schedule.tsx
    │   │   ├── maintenance.tsx
    │   │   ├── about.tsx
    │   │   ├── contact.tsx
    │   │   ├── privacy.tsx
    │   │   └── terms.tsx
    │   └── server/
    │       ├── sitemap.ts
    │       └── seed-data.ts
    └── tests/
        ├── unit/
        │   ├── schemas.test.ts
        │   ├── ref-id.test.ts
        │   └── platform.test.ts
        └── e2e/
            ├── browse-listings.spec.ts
            ├── submit-showing.spec.ts
            ├── submit-maintenance.spec.ts
            └── a11y.spec.ts
```

---

## Task 0: Repo Bootstrap

**Files:**
- Create: `/home/mocap/AR_management/.gitignore`
- Create: `/home/mocap/AR_management/.nvmrc`
- Create: `/home/mocap/AR_management/README.md`
- Create: `/home/mocap/AR_management/package.json`
- Create: `/home/mocap/AR_management/pnpm-workspace.yaml`
- Create: `/home/mocap/AR_management/turbo.json`
- Create: `/home/mocap/AR_management/.env.example`

- [ ] **Step 1: Initialize git repo**

```bash
cd /home/mocap/AR_management
git init -b main
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
# deps
node_modules/
.pnpm-store/
.turbo/

# build outputs
dist/
build/
.next/
.expo/
*.tsbuildinfo

# env
.env
.env.local
.env.*.local

# supabase local
supabase/.branches/
supabase/.temp/

# logs
*.log
npm-debug.log*
pnpm-debug.log*

# OS
.DS_Store
Thumbs.db

# editors
.vscode/
.idea/

# testing
coverage/
playwright-report/
test-results/

# secrets
*.pem
*.key
service-account*.json
```

- [ ] **Step 3: Write `.nvmrc`**

```
22
```

- [ ] **Step 4: Write `README.md`**

```markdown
# AR Management

Cross-platform property management app for Grass Lake Manor and Winnetka Manor.

## Stack
- Frontend: Lynx (rspeedy) → iOS, Android, Web
- Backend: Supabase (Postgres + Auth + Storage + Edge Functions)
- Email: Resend
- Hosting: Vercel (web), EAS Build → App Store / Play Store (mobile)

## Docs
- Spec: `docs/superpowers/specs/2026-05-03-ar-management-public-site-design.md`
- Plan: `docs/superpowers/plans/2026-05-03-ar-management-public-site-plan.md`
- Research: `AR.md`

## Local dev
1. Install Node 22 (`nvm use`).
2. Install pnpm: `npm i -g pnpm@9`.
3. Install Supabase CLI: `brew install supabase/tap/supabase` or see docs.
4. `pnpm install`
5. `cp .env.example .env` and fill in values.
6. `pnpm supabase start` (starts local Supabase on Docker).
7. `pnpm --filter @ar/lynx dev` (starts Lynx dev server).
```

- [ ] **Step 5: Write `package.json`**

```json
{
  "name": "ar-management",
  "private": true,
  "version": "0.0.0",
  "engines": { "node": ">=22 <23", "pnpm": ">=9" },
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "supabase": "supabase",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.6.0",
    "prettier": "^3.4.0"
  }
}
```

- [ ] **Step 6: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 7: Write `turbo.json`**

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**", ".next/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "outputs": [] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
  }
}
```

- [ ] **Step 8: Write `.env.example`**

```bash
# Supabase (public)
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=__from_supabase_start__

# Supabase (server-only — Edge Functions)
SUPABASE_SERVICE_ROLE_KEY=__from_supabase_start__

# Resend (server-only)
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=hello@ar-management.example

# Cloudflare Turnstile
VITE_TURNSTILE_SITE_KEY=0x4AAA__site
TURNSTILE_SECRET_KEY=0x4AAA__secret

# Sentry (public DSN OK in client, but split per platform later)
VITE_SENTRY_DSN=https://...@sentry.io/123

# Notification fan-out
EMERGENCY_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

- [ ] **Step 9: Install root deps**

```bash
cd /home/mocap/AR_management
corepack enable
pnpm install
```

Expected: `pnpm install` completes; `node_modules/` and `pnpm-lock.yaml` appear.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: bootstrap monorepo with pnpm + turbo"
```

---

## Task 1: Lynx 48-Hour Spike — HARD GATE

> **STOP IF THIS FAILS.** Goal: prove rspeedy can build to iOS, Android, and Web; prove `@supabase/supabase-js` works in the Lynx runtime; prove a photo upload works on each platform; check whether SSR/prerender is supported. If any of these fail, halt and re-plan with Approach 2 (Hono + Neon + a separate Next.js web target).

**Files:**
- Create: `/home/mocap/AR_management/apps/lynx/` (entire directory via `npm create rspeedy@latest`)

- [ ] **Step 1: Scaffold the Lynx app**

```bash
cd /home/mocap/AR_management/apps
npm create rspeedy@latest -- --dir lynx
```

Accept defaults for project name (`lynx`), template (ReactLynx + TypeScript). When prompted for "install now", choose No (we use pnpm at root).

Verify: `apps/lynx/package.json` exists with `@lynx-js/react` and `@lynx-js/rspeedy` deps.

- [ ] **Step 2: Add Lynx workspace to root**

Edit `/home/mocap/AR_management/apps/lynx/package.json` — change `"name"` to `"@ar/lynx"` and add to `scripts`:

```json
{
  "name": "@ar/lynx",
  "scripts": {
    "dev": "rspeedy dev",
    "build": "rspeedy build",
    "preview": "rspeedy preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

Then `cd /home/mocap/AR_management && pnpm install`.

- [ ] **Step 3: Verify hello-world dev server (web)**

```bash
pnpm --filter @ar/lynx dev
```

Expected: dev server starts on `http://localhost:3000` (or rspeedy default). Open in browser, see the rspeedy hello page. Stop with Ctrl-C.

- [ ] **Step 4: Build for iOS simulator**

Per Lynx docs, Lynx mobile rendering uses the LynxKit native runtime. The rspeedy template includes scripts for serving a development bundle to a Lynx client app. Two paths:

a. Use the **Lynx Explorer** prebuilt app (download from lynxjs.org) and point it at `http://<your-IP>:3000`.
b. Use **EAS Build** with a custom dev client.

For the spike, use path (a): install Lynx Explorer on the iOS simulator, scan the QR code from rspeedy dev server output. Verify hello-world renders. Capture a screenshot to `docs/superpowers/spike/ios.png`.

- [ ] **Step 5: Verify hello-world on Android emulator**

Same as Step 4 with Android Studio emulator + Lynx Explorer Android. Capture screenshot to `docs/superpowers/spike/android.png`.

- [ ] **Step 6: Add `@supabase/supabase-js` and prove fetch works**

```bash
pnpm --filter @ar/lynx add @supabase/supabase-js
```

Edit `apps/lynx/src/App.tsx`:

```tsx
import { useEffect, useState } from '@lynx-js/react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://demo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNzAzMjQ4MiwiZXhwIjoxOTUyNjA4NDgyfQ.test'
)

export function App() {
  const [status, setStatus] = useState('idle')
  useEffect(() => {
    fetch('https://httpbin.org/get').then((r) => r.json()).then(() => setStatus('ok')).catch((e) => setStatus(`err: ${e.message}`))
  }, [])
  return <text>Supabase client constructed; fetch={status}</text>
}
```

Reload all three platforms. Expect "fetch=ok" on web, iOS, and Android. Document any platform that fails in `docs/superpowers/spike/SPIKE-NOTES.md`.

- [ ] **Step 7: Prove photo upload on each platform**

```bash
pnpm --filter @ar/lynx add @lynx-js/photo-picker
```

(If that package does not exist as named, search the Lynx docs for the canonical photo/camera module — at the time of writing it may be `@lynx-js/image-picker` or require a custom native module. Note exact package name in `SPIKE-NOTES.md`.)

Add a button in `App.tsx` that opens the picker, reads the selected image, and POSTs it to `https://httpbin.org/post`. Verify a 200 response on each platform. If no Lynx photo picker package exists, the spike has revealed a blocker — stop and document.

- [ ] **Step 8: Check rspeedy SSR / prerender support**

Search the Lynx docs and rspeedy CLI for `--ssr`, `--prerender`, or `output: 'static'`. Try `pnpm --filter @ar/lynx build` and inspect `apps/lynx/dist/`:

- If the output contains `index.html` with rendered HTML for the home route → SSG works.
- If output contains only JS bundles + a near-empty `index.html` → SEO will require fallback.

Record findings in `SPIKE-NOTES.md`. If SSR/SSG is unavailable, the SEO mitigation is to write a tiny build-time prerender script using Puppeteer that snapshots each marketing route — capture this as a follow-up note for Task 18.

- [ ] **Step 9: Write spike report and decision**

Create `/home/mocap/AR_management/docs/superpowers/spike/SPIKE-NOTES.md` with sections:
- Hello-world: PASS/FAIL per platform.
- Supabase fetch: PASS/FAIL per platform.
- Photo upload: PASS/FAIL per platform + package used.
- SSR/SSG: AVAILABLE / NOT AVAILABLE / WORKAROUND.
- **Decision:** PROCEED with plan / HALT and re-plan.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "spike: validate Lynx + Supabase + uploads + SSR on iOS/Android/Web"
```

> If decision is HALT, stop here and report findings to user. Do not proceed to Task 2.

---

## Task 2: Shared Schemas Package

**Files:**
- Create: `/home/mocap/AR_management/packages/shared/package.json`
- Create: `/home/mocap/AR_management/packages/shared/tsconfig.json`
- Create: `/home/mocap/AR_management/packages/shared/src/index.ts`
- Create: `/home/mocap/AR_management/packages/shared/src/env.ts`
- Create: `/home/mocap/AR_management/packages/shared/src/ref-id.ts`
- Create: `/home/mocap/AR_management/packages/shared/src/schemas/building.ts`
- Create: `/home/mocap/AR_management/packages/shared/src/schemas/unit.ts`
- Create: `/home/mocap/AR_management/packages/shared/src/schemas/showing-request.ts`
- Create: `/home/mocap/AR_management/packages/shared/src/schemas/maintenance-request.ts`
- Test: `/home/mocap/AR_management/packages/shared/tests/ref-id.test.ts`
- Test: `/home/mocap/AR_management/packages/shared/tests/schemas.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@ar/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint . --ext .ts"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "isolatedModules": true,
    "declaration": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Write the failing test for ref-id**

Create `packages/shared/tests/ref-id.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateRefId } from '../src/ref-id'

describe('generateRefId', () => {
  it('returns an 8-char uppercase alphanumeric id', () => {
    const id = generateRefId()
    expect(id).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('does not include ambiguous chars (0, O, 1, I, L)', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateRefId()
      expect(id).not.toMatch(/[0O1IL]/)
    }
  })

  it('returns different ids on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRefId()))
    expect(ids.size).toBeGreaterThan(95)
  })
})
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
cd /home/mocap/AR_management
pnpm --filter @ar/shared install
pnpm --filter @ar/shared test
```

Expected: FAIL with "Cannot find module '../src/ref-id'".

- [ ] **Step 5: Implement `src/ref-id.ts`**

```ts
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0,O,1,I,L

export function generateRefId(length = 8): string {
  const arr = new Uint32Array(length)
  crypto.getRandomValues(arr)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[arr[i]! % ALPHABET.length]
  }
  return out
}
```

- [ ] **Step 6: Run test, confirm pass**

```bash
pnpm --filter @ar/shared test
```

Expected: 3 passing.

- [ ] **Step 7: Write Zod schemas**

Create `packages/shared/src/schemas/building.ts`:

```ts
import { z } from 'zod'

export const BuildingSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  address_line1: z.string().min(1),
  address_line2: z.string().nullable(),
  city: z.string().min(1),
  state: z.string().length(2),
  postal_code: z.string().min(3),
  country: z.string().length(2).default('US'),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  description_md: z.string(),
  neighborhood_md: z.string(),
  amenities: z.array(z.string()),
  hero_photo_path: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_email: z.string().email().nullable(),
  seo_title: z.string().max(60).nullable(),
  seo_description: z.string().max(160).nullable(),
  is_published: z.boolean(),
})
export type Building = z.infer<typeof BuildingSchema>
```

Create `packages/shared/src/schemas/unit.ts`:

```ts
import { z } from 'zod'

export const UnitStatus = z.enum(['available', 'leased', 'coming_soon', 'off_market'])
export type UnitStatusT = z.infer<typeof UnitStatus>

export const UnitSchema = z.object({
  id: z.string().uuid(),
  building_id: z.string().uuid(),
  unit_number: z.string().min(1).max(32),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().min(0).max(10),
  sqft: z.number().int().positive().nullable(),
  monthly_rent_cents: z.number().int().positive(),
  deposit_cents: z.number().int().nonnegative().nullable(),
  available_from: z.string().date().nullable(),
  status: UnitStatus,
  floor_plan_path: z.string().nullable(),
  description_md: z.string(),
  sort_order: z.number().int().default(0),
})
export type Unit = z.infer<typeof UnitSchema>
```

Create `packages/shared/src/schemas/showing-request.ts`:

```ts
import { z } from 'zod'

export const ShowingRequestInputSchema = z.object({
  building_id: z.string().uuid(),
  unit_id: z.string().uuid().nullable(),
  slot_id: z.string().uuid().nullable(),
  prospect_name: z.string().min(1).max(120),
  prospect_email: z.string().email(),
  prospect_phone: z.string().min(7).max(32).nullable(),
  preferred_dates: z.array(z.string().date()).max(3).nullable(),
  message: z.string().max(2000).nullable(),
  source: z.enum(['web', 'ios', 'android']),
  turnstile_token: z.string().min(1),
}).refine(
  (v) => v.slot_id !== null || (v.preferred_dates !== null && v.preferred_dates.length >= 1),
  { message: 'Either pick a slot or provide at least one preferred date' }
)
export type ShowingRequestInput = z.infer<typeof ShowingRequestInputSchema>
```

Create `packages/shared/src/schemas/maintenance-request.ts`:

```ts
import { z } from 'zod'

export const IssueType = z.enum(['plumbing','electrical','hvac','appliance','pest','locks','other'])
export const Urgency = z.enum(['low','normal','high','emergency'])

export const MaintenanceRequestInputSchema = z.object({
  building_id: z.string().uuid(),
  unit_number: z.string().min(1).max(32),
  tenant_name: z.string().min(1).max(120),
  tenant_email: z.string().email().nullable(),
  tenant_phone: z.string().min(7).max(32).nullable(),
  issue_type: IssueType,
  urgency: Urgency,
  description: z.string().min(10).max(4000),
  photo_paths: z.array(z.string()).max(5),
  source: z.enum(['web','ios','android']),
  turnstile_token: z.string().min(1),
}).refine(
  (v) => v.tenant_email !== null || v.tenant_phone !== null,
  { message: 'Provide an email or phone number' }
)
export type MaintenanceRequestInput = z.infer<typeof MaintenanceRequestInputSchema>
```

- [ ] **Step 8: Write env schema**

Create `packages/shared/src/env.ts`:

```ts
import { z } from 'zod'

export const ClientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_TURNSTILE_SITE_KEY: z.string().min(10),
  VITE_SENTRY_DSN: z.string().url().optional(),
})

export const ServerEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  RESEND_API_KEY: z.string().startsWith('re_'),
  RESEND_FROM_EMAIL: z.string().email(),
  TURNSTILE_SECRET_KEY: z.string().min(10),
  EMERGENCY_WEBHOOK_URL: z.string().url().optional(),
})

export type ClientEnv = z.infer<typeof ClientEnvSchema>
export type ServerEnv = z.infer<typeof ServerEnvSchema>
```

- [ ] **Step 9: Write index.ts barrel**

Create `packages/shared/src/index.ts`:

```ts
export * from './env'
export * from './ref-id'
export * from './schemas/building'
export * from './schemas/unit'
export * from './schemas/showing-request'
export * from './schemas/maintenance-request'
```

- [ ] **Step 10: Write schema test**

Create `packages/shared/tests/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ShowingRequestInputSchema, MaintenanceRequestInputSchema } from '../src'

describe('ShowingRequestInputSchema', () => {
  const base = {
    building_id: '00000000-0000-0000-0000-000000000001',
    unit_id: null,
    slot_id: null,
    prospect_name: 'Jane Doe',
    prospect_email: 'jane@example.com',
    prospect_phone: null,
    preferred_dates: ['2026-06-01'],
    message: null,
    source: 'web' as const,
    turnstile_token: 'tk_xxx',
  }

  it('accepts minimal valid input with preferred dates', () => {
    expect(() => ShowingRequestInputSchema.parse(base)).not.toThrow()
  })

  it('rejects when neither slot nor preferred dates provided', () => {
    expect(() =>
      ShowingRequestInputSchema.parse({ ...base, preferred_dates: null })
    ).toThrow(/Either pick a slot/)
  })
})

describe('MaintenanceRequestInputSchema', () => {
  const base = {
    building_id: '00000000-0000-0000-0000-000000000001',
    unit_number: '3B',
    tenant_name: 'John Renter',
    tenant_email: 'j@example.com',
    tenant_phone: null,
    issue_type: 'plumbing' as const,
    urgency: 'normal' as const,
    description: 'Sink is leaking under the cabinet.',
    photo_paths: [],
    source: 'web' as const,
    turnstile_token: 'tk_xxx',
  }

  it('accepts minimal valid input', () => {
    expect(() => MaintenanceRequestInputSchema.parse(base)).not.toThrow()
  })

  it('rejects when both email and phone are null', () => {
    expect(() =>
      MaintenanceRequestInputSchema.parse({ ...base, tenant_email: null, tenant_phone: null })
    ).toThrow(/email or phone/)
  })

  it('rejects more than 5 photos', () => {
    expect(() =>
      MaintenanceRequestInputSchema.parse({ ...base, photo_paths: ['a','b','c','d','e','f'] })
    ).toThrow()
  })
})
```

- [ ] **Step 11: Run all tests**

```bash
pnpm --filter @ar/shared test
```

Expected: 8 passing (3 ref-id + 2 + 3 schemas).

- [ ] **Step 12: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add Zod schemas, env validation, ref-id generator"
```

---

## Task 3: Supabase Local Setup + Init Migration

**Files:**
- Create: `/home/mocap/AR_management/supabase/config.toml`
- Create: `/home/mocap/AR_management/supabase/migrations/20260503000100_init.sql`

- [ ] **Step 1: Install Supabase CLI globally (or via brew)**

```bash
brew install supabase/tap/supabase
supabase --version
```

Expected: prints version (≥ 1.200).

- [ ] **Step 2: Init Supabase in repo**

```bash
cd /home/mocap/AR_management
supabase init
```

This creates `supabase/config.toml` and `supabase/migrations/`. Edit `supabase/config.toml`: under `[api]`, ensure `port = 54321`; under `[db]`, ensure `port = 54322`; under `[studio]`, ensure `port = 54323`.

- [ ] **Step 3: Start local Supabase**

```bash
supabase start
```

Expected: prints API URL `http://127.0.0.1:54321`, Studio URL `http://127.0.0.1:54323`, anon key, service role key. Copy anon and service role keys into `/home/mocap/AR_management/.env` (created from `.env.example`).

- [ ] **Step 4: Write init migration**

Create `supabase/migrations/20260503000100_init.sql`:

```sql
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
```

- [ ] **Step 5: Apply migration locally**

```bash
supabase db reset
```

Expected: prints "Applying migration 20260503000100_init.sql ... Finished".

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "chore(db): init supabase project + extensions + helpers"
```

---

## Task 4: Database Schema Migrations

**Files:**
- Create: `supabase/migrations/20260503000200_buildings.sql`
- Create: `supabase/migrations/20260503000300_units.sql`
- Create: `supabase/migrations/20260503000400_photos.sql`
- Create: `supabase/migrations/20260503000500_availability_slots.sql`
- Create: `supabase/migrations/20260503000600_showing_requests.sql`
- Create: `supabase/migrations/20260503000700_maintenance_requests.sql`
- Create: `supabase/migrations/20260503000800_audit_log.sql`
- Create: `supabase/migrations/20260503000900_managers_allowlist.sql`

- [ ] **Step 1: Write `20260503000200_buildings.sql`**

```sql
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$' and length(slug) between 1 and 64),
  name text not null check (length(name) between 1 and 120),
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null check (length(state) = 2),
  postal_code text not null,
  country text not null default 'US' check (length(country) = 2),
  lat numeric(9,6),
  lng numeric(9,6),
  description_md text not null default '',
  neighborhood_md text not null default '',
  amenities text[] not null default '{}',
  hero_photo_path text,
  contact_phone text,
  contact_email text,
  seo_title text,
  seo_description text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_buildings_updated_at
before update on public.buildings
for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Write `20260503000300_units.sql`**

```sql
create table public.units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  unit_number text not null check (length(unit_number) between 1 and 32),
  bedrooms smallint not null check (bedrooms between 0 and 10),
  bathrooms numeric(3,1) not null check (bathrooms between 0 and 10),
  sqft integer check (sqft > 0),
  monthly_rent_cents integer not null check (monthly_rent_cents > 0),
  deposit_cents integer check (deposit_cents >= 0),
  available_from date,
  status text not null check (status in ('available','leased','coming_soon','off_market')),
  floor_plan_path text,
  description_md text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, unit_number)
);

create index idx_units_building_status on public.units (building_id, status);
create index idx_units_available_listing on public.units (status, monthly_rent_cents) where status in ('available','coming_soon');

create trigger trg_units_updated_at
before update on public.units
for each row execute function public.set_updated_at();
```

- [ ] **Step 3: Write `20260503000400_photos.sql`**

```sql
create table public.building_photos (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  storage_path text not null,
  alt_text text not null check (length(alt_text) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_building_photos_order on public.building_photos (building_id, sort_order);

create table public.unit_photos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  storage_path text not null,
  alt_text text not null check (length(alt_text) between 1 and 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_unit_photos_order on public.unit_photos (unit_id, sort_order);
```

- [ ] **Step 4: Write `20260503000500_availability_slots.sql`**

```sql
create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open','booked','blocked')),
  booked_by_request_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index idx_slots_open_future
  on public.availability_slots (building_id, starts_at)
  where status = 'open';

create trigger trg_slots_updated_at
before update on public.availability_slots
for each row execute function public.set_updated_at();
```

- [ ] **Step 5: Write `20260503000600_showing_requests.sql`**

```sql
create table public.showing_requests (
  id uuid primary key default gen_random_uuid(),
  ref_id text not null unique,
  building_id uuid not null references public.buildings(id),
  unit_id uuid references public.units(id),
  slot_id uuid references public.availability_slots(id),
  prospect_name text not null,
  prospect_email text not null,
  prospect_phone text,
  preferred_dates jsonb,
  message text,
  status text not null default 'new' check (status in ('new','scheduled','completed','canceled','no_show')),
  scheduled_at timestamptz,
  manager_notes text,
  source text not null check (source in ('web','ios','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slot_id is not null or (preferred_dates is not null and jsonb_array_length(preferred_dates) >= 1))
);

create index idx_showing_status on public.showing_requests (status, created_at desc);

-- backfill the FK from availability_slots after table exists
alter table public.availability_slots
  add constraint availability_slots_booked_by_fk
  foreign key (booked_by_request_id) references public.showing_requests(id);

create trigger trg_showing_updated_at
before update on public.showing_requests
for each row execute function public.set_updated_at();
```

- [ ] **Step 6: Write `20260503000700_maintenance_requests.sql`**

```sql
create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  ref_id text not null unique,
  building_id uuid not null references public.buildings(id),
  unit_number text not null,
  tenant_name text not null,
  tenant_email text,
  tenant_phone text,
  issue_type text not null check (issue_type in ('plumbing','electrical','hvac','appliance','pest','locks','other')),
  urgency text not null check (urgency in ('low','normal','high','emergency')),
  description text not null,
  photo_paths text[] not null default '{}',
  status text not null default 'new' check (status in ('new','acknowledged','in_progress','resolved','closed')),
  assigned_to uuid references auth.users(id),
  manager_notes text,
  source text not null check (source in ('web','ios','android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tenant_email is not null or tenant_phone is not null),
  check (array_length(photo_paths, 1) is null or array_length(photo_paths, 1) <= 5)
);

create index idx_maint_status on public.maintenance_requests (status, urgency, created_at desc);
create index idx_maint_building on public.maintenance_requests (building_id, status);

create trigger trg_maint_updated_at
before update on public.maintenance_requests
for each row execute function public.set_updated_at();
```

- [ ] **Step 7: Write `20260503000800_audit_log.sql`**

```sql
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
```

- [ ] **Step 8: Write `20260503000900_managers_allowlist.sql`**

```sql
create table public.managers_allowlist (
  email text primary key,
  role text not null default 'manager',
  added_at timestamptz not null default now()
);

create or replace function public.enforce_manager_allowlist()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.email is null then
    raise exception 'Email required for manager signup';
  end if;
  if not exists (select 1 from public.managers_allowlist where email = new.email) then
    raise exception 'Email % is not on the manager allowlist', new.email;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_manager_allowlist
before insert on auth.users
for each row execute function public.enforce_manager_allowlist();
```

- [ ] **Step 9: Apply and verify**

```bash
supabase db reset
```

Expected: every migration applies successfully.

```bash
supabase db diff
```

Expected: "No schema changes found" (clean state matches migrations).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add all v1 tables (buildings, units, photos, slots, requests, audit, allowlist)"
```

---

## Task 5: Storage Buckets + RLS Policies + Audit Triggers

**Files:**
- Create: `supabase/migrations/20260503001000_storage_buckets.sql`
- Create: `supabase/migrations/20260503001100_rls_policies.sql`
- Create: `supabase/migrations/20260503001200_triggers.sql`

- [ ] **Step 1: Write storage buckets migration**

Create `supabase/migrations/20260503001000_storage_buckets.sql`:

```sql
insert into storage.buckets (id, name, public)
values
  ('public-photos', 'public-photos', true),
  ('maintenance-uploads', 'maintenance-uploads', false)
on conflict (id) do nothing;

-- public-photos policies: anon read, authenticated write
create policy "public-photos read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'public-photos');

create policy "public-photos write"
on storage.objects for insert
to authenticated
with check (bucket_id = 'public-photos');

create policy "public-photos update"
on storage.objects for update
to authenticated
using (bucket_id = 'public-photos');

create policy "public-photos delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'public-photos');

-- maintenance-uploads policies: writes via signed URLs only (Edge Function);
-- direct anon writes are blocked. Authenticated managers may read.
create policy "maintenance-uploads read"
on storage.objects for select
to authenticated
using (bucket_id = 'maintenance-uploads');
```

- [ ] **Step 2: Write RLS policies migration**

Create `supabase/migrations/20260503001100_rls_policies.sql`:

```sql
-- Enable RLS on every business table
alter table public.buildings              enable row level security;
alter table public.units                   enable row level security;
alter table public.building_photos         enable row level security;
alter table public.unit_photos             enable row level security;
alter table public.availability_slots      enable row level security;
alter table public.showing_requests        enable row level security;
alter table public.maintenance_requests    enable row level security;
alter table public.audit_log               enable row level security;
alter table public.managers_allowlist      enable row level security;

-- buildings
create policy "buildings public read" on public.buildings
  for select to anon, authenticated using (is_published = true);
create policy "buildings manager all" on public.buildings
  for all to authenticated using (true) with check (true);

-- units
create policy "units public read" on public.units
  for select to anon, authenticated using (status in ('available','coming_soon'));
create policy "units manager all" on public.units
  for all to authenticated using (true) with check (true);

-- building_photos / unit_photos
create policy "building_photos public read" on public.building_photos
  for select to anon, authenticated using (true);
create policy "building_photos manager all" on public.building_photos
  for all to authenticated using (true) with check (true);

create policy "unit_photos public read" on public.unit_photos
  for select to anon, authenticated using (true);
create policy "unit_photos manager all" on public.unit_photos
  for all to authenticated using (true) with check (true);

-- availability_slots
create policy "slots public read" on public.availability_slots
  for select to anon, authenticated
  using (status = 'open' and starts_at > now());
create policy "slots manager all" on public.availability_slots
  for all to authenticated using (true) with check (true);

-- showing_requests
create policy "showing public insert" on public.showing_requests
  for insert to anon, authenticated with check (true);
create policy "showing manager read" on public.showing_requests
  for select to authenticated using (true);
create policy "showing manager update" on public.showing_requests
  for update to authenticated using (true) with check (true);

-- maintenance_requests
create policy "maint public insert" on public.maintenance_requests
  for insert to anon, authenticated with check (true);
create policy "maint manager read" on public.maintenance_requests
  for select to authenticated using (true);
create policy "maint manager update" on public.maintenance_requests
  for update to authenticated using (true) with check (true);

-- audit_log: managers can read; writes happen via security-definer trigger
create policy "audit manager read" on public.audit_log
  for select to authenticated using (true);

-- managers_allowlist: managers may read their own membership
create policy "allowlist self read" on public.managers_allowlist
  for select to authenticated
  using (email = auth.jwt()->>'email');
```

- [ ] **Step 3: Write audit triggers migration**

Create `supabase/migrations/20260503001200_triggers.sql`:

```sql
create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
as $$
declare
  v_actor uuid := auth.uid();
  v_diff jsonb;
begin
  if (tg_op = 'INSERT') then
    v_diff := to_jsonb(new);
    insert into public.audit_log (table_name, record_id, action, actor_id, diff)
    values (tg_table_name, new.id, 'insert', v_actor, v_diff);
    return new;
  elsif (tg_op = 'UPDATE') then
    v_diff := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
    insert into public.audit_log (table_name, record_id, action, actor_id, diff)
    values (tg_table_name, new.id,
            case when old.status is distinct from new.status then 'status_change' else 'update' end,
            v_actor, v_diff);
    return new;
  elsif (tg_op = 'DELETE') then
    v_diff := to_jsonb(old);
    insert into public.audit_log (table_name, record_id, action, actor_id, diff)
    values (tg_table_name, old.id, 'delete', v_actor, v_diff);
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_audit_buildings
after insert or update or delete on public.buildings
for each row execute function public.write_audit();

create trigger trg_audit_units
after insert or update or delete on public.units
for each row execute function public.write_audit();

create trigger trg_audit_showing
after insert or update or delete on public.showing_requests
for each row execute function public.write_audit();

create trigger trg_audit_maint
after insert or update or delete on public.maintenance_requests
for each row execute function public.write_audit();
```

- [ ] **Step 4: Apply and verify**

```bash
supabase db reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;"
```

Expected: every business table shows `rowsecurity = t`.

- [ ] **Step 5: Smoke test RLS via SQL**

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" <<'SQL'
-- as anon
set role anon;
insert into public.buildings (slug, name, address_line1, city, state, postal_code)
  values ('hack', 'Hack Mansion', '1 Hack St', 'Hackville', 'CA', '90000');
SQL
```

Expected: error "new row violates row-level security policy".

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/2026050300{10,11,12}*.sql
git commit -m "feat(db): storage buckets, RLS policies, audit log triggers"
```

---

## Task 6: Seed Data (Two Buildings)

**Files:**
- Create: `/home/mocap/AR_management/supabase/seed.sql`

- [ ] **Step 1: Write seed.sql**

```sql
-- Seed two buildings (deterministic UUIDs for stable references)
insert into public.buildings (
  id, slug, name, address_line1, city, state, postal_code,
  description_md, neighborhood_md, amenities, is_published,
  seo_title, seo_description
) values
(
  '11111111-1111-1111-1111-111111111111',
  'grass-lake-manor',
  'Grass Lake Manor Apartments',
  '__ADDRESS_TBD__',
  '__CITY__',
  'MI',
  '__ZIP__',
  'Grass Lake Manor offers comfortable apartment living in a quiet residential setting.',
  'Walkable neighborhood with parks, schools, and local shops nearby.',
  array['parking','laundry on site','pet friendly'],
  true,
  'Grass Lake Manor Apartments — Apartments for Rent',
  'Comfortable apartments at Grass Lake Manor. Browse available units, schedule a showing, or submit a maintenance request.'
),
(
  '22222222-2222-2222-2222-222222222222',
  'winnetka-manor',
  'Winnetka Manor Apartments',
  '__ADDRESS_TBD__',
  '__CITY__',
  'IL',
  '__ZIP__',
  'Winnetka Manor combines classic apartment charm with modern conveniences.',
  'Close to public transit, restaurants, and green spaces.',
  array['parking','laundry on site','elevator'],
  true,
  'Winnetka Manor Apartments — Apartments for Rent',
  'Apartments at Winnetka Manor. View available units, schedule a tour, or report a maintenance issue.'
)
on conflict (id) do nothing;

-- Seed manager allowlist (replace with real emails before production)
insert into public.managers_allowlist (email, role) values
  ('manager@ar-management.example', 'manager')
on conflict (email) do nothing;
```

> **Note:** `__ADDRESS_TBD__`, `__CITY__`, `__ZIP__`, and the manager email are intentional dev placeholders. They are tracked as `OPEN-1` and `OPEN-2`. Before promoting to production, replace and redeploy seed.

- [ ] **Step 2: Apply seed**

```bash
supabase db reset
```

Expected: seed runs after migrations; `select count(*) from buildings;` returns 2.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat(db): seed two buildings + dev manager allowlist"
```

---

## Task 7: Edge Function — request-upload-urls

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/request-upload-urls/index.ts`

- [ ] **Step 1: Write CORS helper**

Create `supabase/functions/_shared/cors.ts`:

```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
```

- [ ] **Step 2: Write the Edge Function**

Create `supabase/functions/request-upload-urls/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface Body {
  count: number          // 1..5
  turnstile_token: string
  content_type: string   // image/jpeg, image/png, image/webp
}

const ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: corsHeaders })

  const body = (await req.json()) as Body
  if (!body.count || body.count < 1 || body.count > 5) {
    return Response.json({ error: 'count must be 1..5' }, { status: 400, headers: corsHeaders })
  }
  if (!ALLOWED_TYPES.has(body.content_type)) {
    return Response.json({ error: 'unsupported content_type' }, { status: 400, headers: corsHeaders })
  }

  // Verify Turnstile
  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: Deno.env.get('TURNSTILE_SECRET_KEY')!,
      response: body.turnstile_token,
    }),
  }).then((r) => r.json())
  if (!verify.success) {
    return Response.json({ error: 'turnstile failed' }, { status: 403, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const tempId = crypto.randomUUID()
  const uploads: { path: string; signedUrl: string; token: string }[] = []
  const ext = body.content_type === 'image/png' ? 'png' : body.content_type === 'image/webp' ? 'webp' : 'jpg'

  for (let i = 0; i < body.count; i++) {
    const path = `incoming/${tempId}/${i}.${ext}`
    const { data, error } = await supabase.storage
      .from('maintenance-uploads')
      .createSignedUploadUrl(path)
    if (error || !data) {
      return Response.json({ error: error?.message ?? 'failed' }, { status: 500, headers: corsHeaders })
    }
    uploads.push({ path, signedUrl: data.signedUrl, token: data.token })
  }

  return Response.json({ temp_id: tempId, max_bytes: MAX_BYTES, uploads }, { headers: corsHeaders })
})
```

- [ ] **Step 3: Serve and smoke test locally**

```bash
supabase functions serve request-upload-urls --env-file ./.env --no-verify-jwt
```

In another terminal:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/request-upload-urls \
  -H 'content-type: application/json' \
  -d '{"count": 1, "turnstile_token": "XXXX.DUMMY.XXXX.DUMMY", "content_type": "image/jpeg"}'
```

Expected (without Turnstile secret): `403 turnstile failed`. With a real Turnstile bypass test key set in `.env` (`1x0000000000000000000000000000000AA`), expect `200` with a `signedUrl`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/ supabase/functions/request-upload-urls/
git commit -m "feat(edge): add request-upload-urls function with Turnstile + signed URLs"
```

---

## Task 8: Edge Function — notify-on-new-request + Postgres Webhook

**Files:**
- Create: `supabase/functions/_shared/resend.ts`
- Create: `supabase/functions/notify-on-new-request/templates/manager-notification.tsx`
- Create: `supabase/functions/notify-on-new-request/templates/submitter-confirmation.tsx`
- Create: `supabase/functions/notify-on-new-request/index.ts`
- Create: `supabase/migrations/20260503001300_notify_webhooks.sql`

- [ ] **Step 1: Write Resend wrapper**

Create `supabase/functions/_shared/resend.ts`:

```ts
export interface SendEmailArgs {
  to: string[]
  subject: string
  html: string
  reply_to?: string
}

export async function sendEmail(args: SendEmailArgs) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM_EMAIL'),
      to: args.to,
      subject: args.subject,
      html: args.html,
      reply_to: args.reply_to,
    }),
  })
  if (!r.ok) throw new Error(`resend ${r.status} ${await r.text()}`)
  return r.json() as Promise<{ id: string }>
}
```

- [ ] **Step 2: Write email templates as plain HTML strings**

(React Email is overkill for v1; use simple HTML strings with a tiny render helper.)

Create `supabase/functions/notify-on-new-request/templates/manager-notification.tsx`:

```ts
interface Args {
  type: 'maintenance' | 'showing'
  ref_id: string
  building_name: string
  details: Record<string, string>
  studio_url: string
}

export function renderManagerNotification(a: Args): { subject: string; html: string } {
  const prefix = a.details.urgency === 'emergency' ? '[EMERGENCY] ' : ''
  const subject = `${prefix}[AR Management] New ${a.type} request — ${a.building_name} #${a.ref_id}`
  const rows = Object.entries(a.details)
    .map(([k, v]) => `<tr><td style="padding:4px 8px;font-weight:600">${escapeHtml(k)}</td><td style="padding:4px 8px">${escapeHtml(v)}</td></tr>`)
    .join('')
  const html = `
    <!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2>New ${a.type} request</h2>
      <p><strong>${escapeHtml(a.building_name)}</strong> — <code>${escapeHtml(a.ref_id)}</code></p>
      <table style="border-collapse:collapse;border:1px solid #ddd;width:100%">${rows}</table>
      <p style="margin-top:24px"><a href="${escapeAttr(a.studio_url)}" style="background:#111;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block">Open in Supabase</a></p>
    </body></html>`
  return { subject, html }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
function escapeAttr(s: string) { return escapeHtml(s) }
```

Create `supabase/functions/notify-on-new-request/templates/submitter-confirmation.tsx`:

```ts
interface Args {
  type: 'maintenance' | 'showing'
  ref_id: string
  recipient_name: string
}

export function renderSubmitterConfirmation(a: Args): { subject: string; html: string } {
  const subject = `We received your ${a.type} request — AR Management`
  const html = `
    <!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2>Thanks, ${escapeHtml(a.recipient_name)}!</h2>
      <p>We received your ${a.type} request. Your reference is <code>${escapeHtml(a.ref_id)}</code>.</p>
      <p>A property manager will follow up within one business day.</p>
      <p>— AR Management</p>
    </body></html>`
  return { subject, html }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
```

- [ ] **Step 3: Write the Edge Function**

Create `supabase/functions/notify-on-new-request/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/resend.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { renderManagerNotification } from './templates/manager-notification.tsx'
import { renderSubmitterConfirmation } from './templates/submitter-confirmation.tsx'

interface Webhook {
  type: 'INSERT'
  table: 'showing_requests' | 'maintenance_requests'
  record: Record<string, any>
  schema: 'public'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const payload = (await req.json()) as Webhook
  if (payload.type !== 'INSERT') return new Response('ignored', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const isMaint = payload.table === 'maintenance_requests'
  const r = payload.record

  const { data: building } = await supabase.from('buildings').select('name').eq('id', r.building_id).single()
  const { data: managers } = await supabase.from('managers_allowlist').select('email')
  const managerEmails = (managers ?? []).map((m) => m.email)
  if (managerEmails.length === 0) {
    console.warn('no managers in allowlist, skipping fan-out')
  }

  const studioUrl = `${Deno.env.get('SUPABASE_URL')!.replace('/v1', '')}/project/_/editor`
  const details: Record<string, string> = isMaint ? {
    'Unit': r.unit_number,
    'Tenant': r.tenant_name,
    'Email': r.tenant_email ?? '—',
    'Phone': r.tenant_phone ?? '—',
    'Issue': r.issue_type,
    'Urgency': r.urgency,
    'Description': r.description,
    'Photos': String((r.photo_paths as string[]).length),
  } : {
    'Prospect': r.prospect_name,
    'Email': r.prospect_email,
    'Phone': r.prospect_phone ?? '—',
    'Slot ID': r.slot_id ?? '—',
    'Preferred dates': r.preferred_dates ? JSON.stringify(r.preferred_dates) : '—',
    'Message': r.message ?? '—',
  }

  const mgr = renderManagerNotification({
    type: isMaint ? 'maintenance' : 'showing',
    ref_id: r.ref_id,
    building_name: building?.name ?? r.building_id,
    details,
    studio_url: studioUrl,
  })

  const recipientEmail = isMaint ? r.tenant_email : r.prospect_email
  const recipientName = isMaint ? r.tenant_name : r.prospect_name

  const tasks: Promise<unknown>[] = []
  if (managerEmails.length > 0) {
    tasks.push(sendEmail({ to: managerEmails, subject: mgr.subject, html: mgr.html, reply_to: recipientEmail ?? undefined }))
  }
  if (recipientEmail) {
    const sub = renderSubmitterConfirmation({
      type: isMaint ? 'maintenance' : 'showing',
      ref_id: r.ref_id,
      recipient_name: recipientName,
    })
    tasks.push(sendEmail({ to: [recipientEmail], subject: sub.subject, html: sub.html }))
  }

  if (isMaint && r.urgency === 'emergency' && Deno.env.get('EMERGENCY_WEBHOOK_URL')) {
    tasks.push(fetch(Deno.env.get('EMERGENCY_WEBHOOK_URL')!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: mgr.subject + '\n' + mgr.html.replace(/<[^>]+>/g, '').slice(0, 500) }),
    }))
  }

  const results = await Promise.allSettled(tasks)
  const failed = results.filter((x) => x.status === 'rejected')
  if (failed.length > 0) {
    console.error('notify failures', failed)
  }
  return Response.json({ sent: results.length, failed: failed.length }, { headers: corsHeaders })
})
```

- [ ] **Step 4: Wire the Postgres webhook trigger**

Create `supabase/migrations/20260503001300_notify_webhooks.sql`:

```sql
-- Use pg_net to POST to the Edge Function on insert
create or replace function public.notify_on_new_request()
returns trigger
language plpgsql
security definer
as $$
declare
  v_url text := current_setting('app.edge_functions_url', true) || '/notify-on-new-request';
  v_anon text := current_setting('app.anon_key', true);
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

create trigger trg_notify_on_showing
after insert on public.showing_requests
for each row execute function public.notify_on_new_request();

create trigger trg_notify_on_maintenance
after insert on public.maintenance_requests
for each row execute function public.notify_on_new_request();
```

> The `app.edge_functions_url` and `app.anon_key` settings must be configured per environment. Locally:
>
> ```bash
> psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "alter system set app.edge_functions_url = 'http://host.docker.internal:54321/functions/v1';"
> psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "alter system set app.anon_key = '$(grep VITE_SUPABASE_ANON_KEY .env | cut -d= -f2)';"
> psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "select pg_reload_conf();"
> ```

- [ ] **Step 5: Add `ref_id` auto-generation**

Add to the same migration file at the bottom:

```sql
create or replace function public.set_ref_id()
returns trigger
language plpgsql
as $$
begin
  if new.ref_id is null or new.ref_id = '' then
    new.ref_id := upper(substring(md5(gen_random_uuid()::text || now()::text) for 8));
  end if;
  return new;
end;
$$;

create trigger trg_set_ref_id_showing
before insert on public.showing_requests
for each row execute function public.set_ref_id();

create trigger trg_set_ref_id_maint
before insert on public.maintenance_requests
for each row execute function public.set_ref_id();
```

- [ ] **Step 6: Smoke test end-to-end**

```bash
supabase db reset
supabase functions serve notify-on-new-request --env-file ./.env --no-verify-jwt &
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "
insert into public.maintenance_requests
  (building_id, unit_number, tenant_name, tenant_email, issue_type, urgency, description, source)
values
  ('11111111-1111-1111-1111-111111111111', '3B', 'Test Tenant', 'tester@example.com',
   'plumbing', 'normal', 'Test description from smoke test', 'web')
returning id, ref_id;
"
```

Expected: row inserted with auto-generated `ref_id`. Edge Function logs (visible in the `supabase functions serve` terminal) show invocation; if `RESEND_API_KEY` is set, an email is delivered; otherwise the function logs an error (acceptable in dev).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/notify-on-new-request/ supabase/functions/_shared/resend.ts supabase/migrations/20260503001300_notify_webhooks.sql
git commit -m "feat(edge): notify-on-new-request fan-out + ref_id auto-gen + DB webhook"
```

---

## Task 9: Lynx App — Supabase Client + Routing Skeleton

**Files:**
- Create: `apps/lynx/src/lib/env.ts`
- Create: `apps/lynx/src/lib/supabase.ts`
- Create: `apps/lynx/src/lib/platform.ts`
- Create: `apps/lynx/src/lib/queries.ts`
- Modify: `apps/lynx/src/App.tsx`
- Create: `apps/lynx/src/routes/home.tsx`

- [ ] **Step 1: Add deps**

```bash
pnpm --filter @ar/lynx add @supabase/supabase-js @tanstack/react-query zod react-hook-form @hookform/resolvers
pnpm --filter @ar/lynx add -D vitest @vitest/ui playwright @axe-core/playwright
pnpm --filter @ar/lynx add @ar/shared@workspace:*
```

- [ ] **Step 2: Write env loader**

Create `apps/lynx/src/lib/env.ts`:

```ts
import { ClientEnvSchema } from '@ar/shared'

export const env = ClientEnvSchema.parse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
})
```

- [ ] **Step 3: Write Supabase client**

Create `apps/lynx/src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { env } from './env'

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
})
```

- [ ] **Step 4: Write platform detector**

Create `apps/lynx/src/lib/platform.ts`:

```ts
export type Platform = 'web' | 'ios' | 'android'

declare const __LYNX_PLATFORM__: string | undefined

export function detectPlatform(): Platform {
  // Lynx exposes a global __LYNX_PLATFORM__ at build time on native targets.
  if (typeof __LYNX_PLATFORM__ !== 'undefined') {
    if (__LYNX_PLATFORM__ === 'ios') return 'ios'
    if (__LYNX_PLATFORM__ === 'android') return 'android'
  }
  return 'web'
}

export const platform: Platform = detectPlatform()
```

(If the actual Lynx global differs, adjust based on `SPIKE-NOTES.md` findings.)

- [ ] **Step 5: Write TanStack Query hooks**

Create `apps/lynx/src/lib/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Building, Unit } from '@ar/shared'

export function useBuildings() {
  return useQuery({
    queryKey: ['buildings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .eq('is_published', true)
        .order('name')
      if (error) throw error
      return (data ?? []) as Building[]
    },
  })
}

export function useBuildingBySlug(slug: string) {
  return useQuery({
    queryKey: ['buildings', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('*, building_photos(*)')
        .eq('slug', slug)
        .eq('is_published', true)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useAvailableUnits(filters: { building_id?: string; max_rent_cents?: number; bedrooms?: number } = {}) {
  return useQuery({
    queryKey: ['units', filters],
    queryFn: async () => {
      let q = supabase
        .from('units')
        .select('*, unit_photos(*), building:buildings(name, slug)')
        .in('status', ['available', 'coming_soon'])
        .order('monthly_rent_cents')
      if (filters.building_id) q = q.eq('building_id', filters.building_id)
      if (filters.max_rent_cents) q = q.lte('monthly_rent_cents', filters.max_rent_cents)
      if (typeof filters.bedrooms === 'number') q = q.eq('bedrooms', filters.bedrooms)
      const { data, error } = await q
      if (error) throw error
      return data as (Unit & { building: { name: string; slug: string } })[]
    },
  })
}

export function useUnitById(id: string) {
  return useQuery({
    queryKey: ['units', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('units')
        .select('*, unit_photos(*), building:buildings(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 6: Replace App.tsx with QueryClient + simple route stub**

Edit `apps/lynx/src/App.tsx` (full replace):

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Home } from './routes/home'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>
  )
}
```

(Routing for web vs mobile is added in the next task; for now Home is the only screen.)

- [ ] **Step 7: Write Home stub**

Create `apps/lynx/src/routes/home.tsx`:

```tsx
import { useBuildings } from '../lib/queries'

export function Home() {
  const { data, isLoading, error } = useBuildings()
  if (isLoading) return <text>Loading…</text>
  if (error) return <text>Error: {(error as Error).message}</text>
  return (
    <view>
      <text style={{ fontSize: 24, fontWeight: '700' }}>AR Management</text>
      {data?.map((b) => (
        <view key={b.id} style={{ paddingVertical: 12 }}>
          <text style={{ fontSize: 18 }}>{b.name}</text>
          <text style={{ color: '#666' }}>{b.address_line1}, {b.city}, {b.state}</text>
        </view>
      ))}
    </view>
  )
}
```

- [ ] **Step 8: Run dev and verify on web**

```bash
pnpm --filter @ar/lynx dev
```

Open `http://localhost:3000`. Expected: "AR Management" header followed by two building cards (Grass Lake Manor, Winnetka Manor) read from local Supabase.

- [ ] **Step 9: Commit**

```bash
git add apps/lynx/
git commit -m "feat(lynx): supabase client, query hooks, home screen wired to seeded buildings"
```

---

## Task 10: Layout, Routing, and Public Marketing Pages

**Files:**
- Create: `apps/lynx/src/components/Layout/Header.tsx`
- Create: `apps/lynx/src/components/Layout/Footer.tsx`
- Create: `apps/lynx/src/components/Layout/TabBar.tsx`
- Create: `apps/lynx/src/components/BuildingCard.tsx`
- Create: `apps/lynx/src/components/UnitCard.tsx`
- Create: `apps/lynx/src/components/PhotoGallery.tsx`
- Create: `apps/lynx/src/components/FilterChips.tsx`
- Create: `apps/lynx/src/components/SeoHead.tsx`
- Create: `apps/lynx/src/routes/building.tsx`
- Create: `apps/lynx/src/routes/listings.tsx`
- Create: `apps/lynx/src/routes/unit.tsx`
- Create: `apps/lynx/src/routes/about.tsx`
- Create: `apps/lynx/src/routes/contact.tsx`
- Create: `apps/lynx/src/routes/privacy.tsx`
- Create: `apps/lynx/src/routes/terms.tsx`
- Modify: `apps/lynx/src/App.tsx`

- [ ] **Step 1: Add a router**

Lynx web uses standard browsers; native uses a stack. Use **`@lynx-js/react-router`** if it exists per the spike, otherwise fall back to a tiny home-grown router that switches on `window.location.pathname` (web) and a state machine (native).

```bash
pnpm --filter @ar/lynx add @lynx-js/react-router
```

If that package is not available, create `apps/lynx/src/lib/router.tsx`:

```tsx
import { createContext, useContext, useEffect, useState } from '@lynx-js/react'
import { platform } from './platform'

interface Route { path: string; params: Record<string, string> }
const RouteCtx = createContext<{ route: Route; navigate: (path: string) => void }>({
  route: { path: '/', params: {} },
  navigate: () => {},
})

export function RouterProvider({ children }: { children: any }) {
  const [route, setRoute] = useState<Route>(() => parsePath(typeof location !== 'undefined' ? location.pathname : '/'))

  useEffect(() => {
    if (platform !== 'web') return
    const onPop = () => setRoute(parsePath(location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (path: string) => {
    if (platform === 'web') {
      history.pushState({}, '', path)
    }
    setRoute(parsePath(path))
  }

  return <RouteCtx.Provider value={{ route, navigate }}>{children}</RouteCtx.Provider>
}

export const useRoute = () => useContext(RouteCtx)

function parsePath(path: string): Route {
  // patterns: /, /buildings/:slug, /units/:id, /listings, /schedule, /maintenance, /about, /contact, /privacy, /terms
  const segs = path.split('/').filter(Boolean)
  if (segs.length === 0) return { path: '/', params: {} }
  if (segs[0] === 'buildings' && segs[1]) return { path: '/buildings/[slug]', params: { slug: segs[1] } }
  if (segs[0] === 'units' && segs[1]) return { path: '/units/[id]', params: { id: segs[1] } }
  return { path: '/' + segs[0], params: {} }
}
```

- [ ] **Step 2: Header component**

Create `apps/lynx/src/components/Layout/Header.tsx`:

```tsx
import { useRoute } from '../../lib/router'

export function Header() {
  const { navigate } = useRoute()
  const links = [
    { label: 'Home', path: '/' },
    { label: 'Listings', path: '/listings' },
    { label: 'Buildings', path: '/' },
    { label: 'Maintenance', path: '/maintenance' },
    { label: 'About', path: '/about' },
    { label: 'Contact', path: '/contact' },
  ]
  return (
    <view style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: '1px solid #eee' }}>
      <text bindtap={() => navigate('/')} style={{ fontSize: 20, fontWeight: '700' }}>AR Management</text>
      <view style={{ flexDirection: 'row', gap: 16 }}>
        {links.slice(1).map((l) => (
          <text key={l.path} bindtap={() => navigate(l.path)} style={{ color: '#444' }}>{l.label}</text>
        ))}
      </view>
    </view>
  )
}
```

- [ ] **Step 3: Footer component**

Create `apps/lynx/src/components/Layout/Footer.tsx`:

```tsx
import { useRoute } from '../../lib/router'

export function Footer() {
  const { navigate } = useRoute()
  return (
    <view style={{ padding: 24, borderTop: '1px solid #eee', marginTop: 48 }}>
      <view style={{ flexDirection: 'row', gap: 24, marginBottom: 12 }}>
        <text bindtap={() => navigate('/maintenance')} style={{ color: '#0a58ca', fontWeight: '600' }}>Schedule a showing</text>
        <text bindtap={() => navigate('/maintenance')} style={{ color: '#0a58ca', fontWeight: '600' }}>Maintenance</text>
        <text bindtap={() => navigate('/contact')} style={{ color: '#0a58ca', fontWeight: '600' }}>Contact</text>
      </view>
      <view style={{ flexDirection: 'row', gap: 16 }}>
        <text bindtap={() => navigate('/privacy')} style={{ color: '#888', fontSize: 12 }}>Privacy</text>
        <text bindtap={() => navigate('/terms')} style={{ color: '#888', fontSize: 12 }}>Terms</text>
      </view>
      <text style={{ color: '#888', fontSize: 12, marginTop: 8 }}>© AR Management. All rights reserved.</text>
    </view>
  )
}
```

- [ ] **Step 4: TabBar (mobile only)**

Create `apps/lynx/src/components/Layout/TabBar.tsx`:

```tsx
import { useRoute } from '../../lib/router'

export function TabBar() {
  const { navigate, route } = useRoute()
  const tabs: { label: string; path: string }[] = [
    { label: 'Home', path: '/' },
    { label: 'Listings', path: '/listings' },
    { label: 'Maintenance', path: '/maintenance' },
    { label: 'Contact', path: '/contact' },
  ]
  return (
    <view style={{ flexDirection: 'row', borderTop: '1px solid #eee', padding: 8 }}>
      {tabs.map((t) => (
        <view key={t.path} bindtap={() => navigate(t.path)} style={{ flex: 1, alignItems: 'center', padding: 8 }}>
          <text style={{ color: route.path === t.path ? '#0a58ca' : '#666' }}>{t.label}</text>
        </view>
      ))}
    </view>
  )
}
```

- [ ] **Step 5: BuildingCard, UnitCard, PhotoGallery, FilterChips**

Create `apps/lynx/src/components/BuildingCard.tsx`:

```tsx
import { useRoute } from '../lib/router'
import type { Building } from '@ar/shared'

export function BuildingCard({ b }: { b: Building }) {
  const { navigate } = useRoute()
  return (
    <view bindtap={() => navigate(`/buildings/${b.slug}`)} style={{ padding: 16, borderRadius: 12, backgroundColor: '#fafafa', marginBottom: 12 }}>
      <text style={{ fontSize: 20, fontWeight: '600' }}>{b.name}</text>
      <text style={{ color: '#666', marginTop: 4 }}>{b.address_line1}, {b.city}, {b.state}</text>
      <text style={{ color: '#0a58ca', marginTop: 8 }}>View units →</text>
    </view>
  )
}
```

Create `apps/lynx/src/components/UnitCard.tsx`:

```tsx
import { useRoute } from '../lib/router'
import type { Unit } from '@ar/shared'

export function UnitCard({ u }: { u: Unit & { building?: { name: string; slug: string } } }) {
  const { navigate } = useRoute()
  return (
    <view bindtap={() => navigate(`/units/${u.id}`)} style={{ padding: 16, borderRadius: 12, backgroundColor: '#fff', borderColor: '#eee', borderWidth: 1, marginBottom: 12 }}>
      <text style={{ fontSize: 16, fontWeight: '600' }}>Unit {u.unit_number}{u.building ? ` · ${u.building.name}` : ''}</text>
      <text>{u.bedrooms === 0 ? 'Studio' : `${u.bedrooms} bd`} · {u.bathrooms} ba{u.sqft ? ` · ${u.sqft} sqft` : ''}</text>
      <text style={{ fontSize: 18, fontWeight: '700', marginTop: 8 }}>${(u.monthly_rent_cents / 100).toLocaleString()} / mo</text>
      {u.available_from && <text style={{ color: '#666', marginTop: 4 }}>Available {u.available_from}</text>}
    </view>
  )
}
```

Create `apps/lynx/src/components/PhotoGallery.tsx`:

```tsx
interface Photo { storage_path: string; alt_text: string }
import { env } from '../lib/env'

function publicUrl(path: string) {
  return `${env.VITE_SUPABASE_URL}/storage/v1/object/public/public-photos/${path}`
}

export function PhotoGallery({ photos }: { photos: Photo[] }) {
  if (!photos || photos.length === 0) return null
  return (
    <view style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {photos.map((p) => (
        <image key={p.storage_path} src={publicUrl(p.storage_path)} alt={p.alt_text} style={{ width: 200, height: 150, borderRadius: 8 }} />
      ))}
    </view>
  )
}
```

Create `apps/lynx/src/components/FilterChips.tsx`:

```tsx
interface Props {
  building_id: string | null
  setBuilding: (id: string | null) => void
  bedrooms: number | null
  setBedrooms: (n: number | null) => void
  buildings: { id: string; name: string }[]
}

export function FilterChips({ building_id, setBuilding, bedrooms, setBedrooms, buildings }: Props) {
  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <view bindtap={onPress} style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: active ? '#0a58ca' : '#eee', borderRadius: 999 }}>
      <text style={{ color: active ? '#fff' : '#333' }}>{label}</text>
    </view>
  )
  return (
    <view style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      <Chip label="All buildings" active={building_id === null} onPress={() => setBuilding(null)} />
      {buildings.map((b) => (
        <Chip key={b.id} label={b.name} active={building_id === b.id} onPress={() => setBuilding(b.id)} />
      ))}
      <Chip label="Any beds" active={bedrooms === null} onPress={() => setBedrooms(null)} />
      <Chip label="Studio" active={bedrooms === 0} onPress={() => setBedrooms(0)} />
      <Chip label="1 bd" active={bedrooms === 1} onPress={() => setBedrooms(1)} />
      <Chip label="2 bd" active={bedrooms === 2} onPress={() => setBedrooms(2)} />
      <Chip label="3+ bd" active={bedrooms === 3} onPress={() => setBedrooms(3)} />
    </view>
  )
}
```

- [ ] **Step 6: SEO head helper (web-only)**

Create `apps/lynx/src/components/SeoHead.tsx`:

```tsx
import { useEffect } from '@lynx-js/react'
import { platform } from '../lib/platform'

interface Props {
  title: string
  description?: string
  jsonLd?: object
}

export function SeoHead({ title, description, jsonLd }: Props) {
  useEffect(() => {
    if (platform !== 'web') return
    document.title = title
    if (description) {
      let meta = document.querySelector('meta[name="description"]')
      if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'description'); document.head.appendChild(meta) }
      meta.setAttribute('content', description)
    }
    document.querySelectorAll('script[data-jsonld]').forEach((n) => n.remove())
    if (jsonLd) {
      const s = document.createElement('script')
      s.setAttribute('type', 'application/ld+json')
      s.setAttribute('data-jsonld', '1')
      s.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(s)
    }
  }, [title, description, jsonLd])
  return null
}
```

- [ ] **Step 7: Update Home page**

Edit `apps/lynx/src/routes/home.tsx`:

```tsx
import { useBuildings } from '../lib/queries'
import { BuildingCard } from '../components/BuildingCard'
import { SeoHead } from '../components/SeoHead'

export function Home() {
  const { data, isLoading, error } = useBuildings()
  return (
    <view style={{ padding: 16, maxWidth: 960, marginHorizontal: 'auto' }}>
      <SeoHead
        title="AR Management — Apartment Living at Grass Lake Manor and Winnetka Manor"
        description="Browse available apartments, schedule a showing, or submit a maintenance request at Grass Lake Manor and Winnetka Manor."
      />
      <text style={{ fontSize: 32, fontWeight: '700', marginBottom: 8 }}>Find your next home</text>
      <text style={{ color: '#666', marginBottom: 24 }}>Quality apartment living at Grass Lake Manor and Winnetka Manor.</text>
      {isLoading && <text>Loading…</text>}
      {error && <text>Error: {(error as Error).message}</text>}
      {data?.map((b) => <BuildingCard key={b.id} b={b} />)}
    </view>
  )
}
```

- [ ] **Step 8: Building detail page**

Create `apps/lynx/src/routes/building.tsx`:

```tsx
import { useBuildingBySlug, useAvailableUnits } from '../lib/queries'
import { useRoute } from '../lib/router'
import { PhotoGallery } from '../components/PhotoGallery'
import { UnitCard } from '../components/UnitCard'
import { SeoHead } from '../components/SeoHead'

export function BuildingDetail() {
  const { route } = useRoute()
  const slug = route.params.slug ?? ''
  const { data: b, isLoading } = useBuildingBySlug(slug)
  const { data: units } = useAvailableUnits({ building_id: b?.id })

  if (isLoading) return <text>Loading…</text>
  if (!b) return <text>Building not found</text>

  return (
    <view style={{ padding: 16, maxWidth: 960, marginHorizontal: 'auto' }}>
      <SeoHead
        title={b.seo_title ?? `${b.name} — Apartments for Rent`}
        description={b.seo_description ?? b.description_md.slice(0, 160)}
      />
      <text style={{ fontSize: 32, fontWeight: '700' }}>{b.name}</text>
      <text style={{ color: '#666', marginBottom: 16 }}>{b.address_line1}, {b.city}, {b.state} {b.postal_code}</text>
      <PhotoGallery photos={b.building_photos ?? []} />
      <text style={{ marginTop: 16 }}>{b.description_md}</text>
      <text style={{ fontSize: 22, fontWeight: '600', marginTop: 32, marginBottom: 12 }}>Available units</text>
      {(units ?? []).length === 0 ? <text>No units currently available. <text bindtap={() => location.assign('/contact')} style={{ color: '#0a58ca' }}>Contact us</text> to be notified.</text>
        : (units ?? []).map((u) => <UnitCard key={u.id} u={u} />)}
      <text style={{ fontSize: 22, fontWeight: '600', marginTop: 32, marginBottom: 12 }}>Neighborhood</text>
      <text>{b.neighborhood_md}</text>
      <text style={{ fontSize: 22, fontWeight: '600', marginTop: 32, marginBottom: 12 }}>Amenities</text>
      <view style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {b.amenities.map((a: string) => (
          <view key={a} style={{ paddingVertical: 4, paddingHorizontal: 10, backgroundColor: '#f0f4ff', borderRadius: 999 }}>
            <text>{a}</text>
          </view>
        ))}
      </view>
    </view>
  )
}
```

- [ ] **Step 9: Listings page**

Create `apps/lynx/src/routes/listings.tsx`:

```tsx
import { useState } from '@lynx-js/react'
import { useAvailableUnits, useBuildings } from '../lib/queries'
import { UnitCard } from '../components/UnitCard'
import { FilterChips } from '../components/FilterChips'
import { SeoHead } from '../components/SeoHead'

export function Listings() {
  const [building_id, setBuilding] = useState<string | null>(null)
  const [bedrooms, setBedrooms] = useState<number | null>(null)
  const { data: buildings = [] } = useBuildings()
  const { data: units, isLoading } = useAvailableUnits({
    building_id: building_id ?? undefined,
    bedrooms: bedrooms ?? undefined,
  })
  return (
    <view style={{ padding: 16, maxWidth: 960, marginHorizontal: 'auto' }}>
      <SeoHead title="Available Apartments — AR Management" description="Browse all available apartments at Grass Lake Manor and Winnetka Manor." />
      <text style={{ fontSize: 28, fontWeight: '700', marginBottom: 16 }}>Available apartments</text>
      <FilterChips
        building_id={building_id} setBuilding={setBuilding}
        bedrooms={bedrooms} setBedrooms={setBedrooms}
        buildings={buildings.map((b) => ({ id: b.id, name: b.name }))}
      />
      {isLoading ? <text>Loading…</text>
        : (units?.length ?? 0) === 0 ? <text>No units match your filters.</text>
        : units?.map((u) => <UnitCard key={u.id} u={u} />)}
    </view>
  )
}
```

- [ ] **Step 10: Unit detail page**

Create `apps/lynx/src/routes/unit.tsx`:

```tsx
import { useUnitById } from '../lib/queries'
import { useRoute } from '../lib/router'
import { PhotoGallery } from '../components/PhotoGallery'
import { SeoHead } from '../components/SeoHead'

export function UnitDetail() {
  const { route, navigate } = useRoute()
  const id = route.params.id ?? ''
  const { data: u, isLoading } = useUnitById(id)
  if (isLoading) return <text>Loading…</text>
  if (!u) return <text>Unit not found</text>

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Apartment',
    name: `Unit ${u.unit_number} at ${u.building.name}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: u.building.address_line1,
      addressLocality: u.building.city,
      addressRegion: u.building.state,
      postalCode: u.building.postal_code,
    },
    numberOfRooms: u.bedrooms,
    floorSize: u.sqft ? { '@type': 'QuantitativeValue', value: u.sqft, unitCode: 'FTK' } : undefined,
    offers: {
      '@type': 'Offer',
      price: (u.monthly_rent_cents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      availabilityStarts: u.available_from ?? undefined,
    },
  }

  return (
    <view style={{ padding: 16, maxWidth: 960, marginHorizontal: 'auto' }}>
      <SeoHead
        title={`Unit ${u.unit_number} at ${u.building.name} — $${(u.monthly_rent_cents/100).toLocaleString()}/mo`}
        description={`${u.bedrooms === 0 ? 'Studio' : u.bedrooms + ' bedroom'} apartment${u.sqft ? ', ' + u.sqft + ' sqft' : ''} at ${u.building.name}.`}
        jsonLd={jsonLd}
      />
      <text style={{ fontSize: 28, fontWeight: '700' }}>Unit {u.unit_number}</text>
      <text style={{ color: '#666', marginBottom: 16 }}>{u.building.name}</text>
      <PhotoGallery photos={u.unit_photos ?? []} />
      <view style={{ flexDirection: 'row', gap: 24, marginTop: 16 }}>
        <text style={{ fontSize: 22, fontWeight: '700' }}>${(u.monthly_rent_cents/100).toLocaleString()} / mo</text>
        <text>{u.bedrooms === 0 ? 'Studio' : `${u.bedrooms} bd`} · {u.bathrooms} ba{u.sqft ? ` · ${u.sqft} sqft` : ''}</text>
      </view>
      {u.available_from && <text style={{ color: '#666', marginTop: 8 }}>Available from {u.available_from}</text>}
      <text style={{ marginTop: 16 }}>{u.description_md}</text>
      <view bindtap={() => navigate(`/schedule?unit=${u.id}`)} style={{ marginTop: 24, padding: 16, backgroundColor: '#0a58ca', borderRadius: 8, alignSelf: 'flex-start' }}>
        <text style={{ color: '#fff', fontWeight: '600' }}>Schedule a showing</text>
      </view>
    </view>
  )
}
```

- [ ] **Step 11: Static pages**

Create `apps/lynx/src/routes/about.tsx`:

```tsx
import { SeoHead } from '../components/SeoHead'
export function About() {
  return (
    <view style={{ padding: 16, maxWidth: 720, marginHorizontal: 'auto' }}>
      <SeoHead title="About — AR Management" description="About AR Management" />
      <text style={{ fontSize: 28, fontWeight: '700', marginBottom: 12 }}>About AR Management</text>
      <text>AR Management owns and operates Grass Lake Manor and Winnetka Manor apartments. We focus on responsive maintenance, transparent pricing, and a respectful resident experience.</text>
    </view>
  )
}
```

Create `apps/lynx/src/routes/contact.tsx`:

```tsx
import { useBuildings } from '../lib/queries'
import { SeoHead } from '../components/SeoHead'
export function Contact() {
  const { data } = useBuildings()
  return (
    <view style={{ padding: 16, maxWidth: 720, marginHorizontal: 'auto' }}>
      <SeoHead title="Contact — AR Management" description="Contact AR Management" />
      <text style={{ fontSize: 28, fontWeight: '700', marginBottom: 16 }}>Contact</text>
      {data?.map((b) => (
        <view key={b.id} style={{ marginBottom: 16 }}>
          <text style={{ fontSize: 18, fontWeight: '600' }}>{b.name}</text>
          <text>{b.address_line1}, {b.city}, {b.state} {b.postal_code}</text>
          {b.contact_phone && <text>Phone: {b.contact_phone}</text>}
          {b.contact_email && <text>Email: {b.contact_email}</text>}
        </view>
      ))}
    </view>
  )
}
```

Create `apps/lynx/src/routes/privacy.tsx`:

```tsx
import { SeoHead } from '../components/SeoHead'
export function Privacy() {
  return (
    <view style={{ padding: 16, maxWidth: 720, marginHorizontal: 'auto' }}>
      <SeoHead title="Privacy — AR Management" />
      <text style={{ fontSize: 28, fontWeight: '700', marginBottom: 12 }}>Privacy Policy</text>
      <text>We collect only the information you provide via our forms (name, contact info, request details, photos). We use this information to respond to your request and operate our properties. We do not sell personal information. Email privacy@ar-management.example with questions.</text>
    </view>
  )
}
```

Create `apps/lynx/src/routes/terms.tsx`:

```tsx
import { SeoHead } from '../components/SeoHead'
export function Terms() {
  return (
    <view style={{ padding: 16, maxWidth: 720, marginHorizontal: 'auto' }}>
      <SeoHead title="Terms — AR Management" />
      <text style={{ fontSize: 28, fontWeight: '700', marginBottom: 12 }}>Terms of Use</text>
      <text>Use of this site is provided on an as-is basis. Submitting a maintenance or showing request does not create a tenancy or a contract. AR Management may update these terms from time to time.</text>
    </view>
  )
}
```

- [ ] **Step 12: Mount routes in App.tsx**

Replace `apps/lynx/src/App.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, useRoute } from './lib/router'
import { Header } from './components/Layout/Header'
import { Footer } from './components/Layout/Footer'
import { TabBar } from './components/Layout/TabBar'
import { platform } from './lib/platform'
import { Home } from './routes/home'
import { BuildingDetail } from './routes/building'
import { Listings } from './routes/listings'
import { UnitDetail } from './routes/unit'
import { About } from './routes/about'
import { Contact } from './routes/contact'
import { Privacy } from './routes/privacy'
import { Terms } from './routes/terms'
import { Schedule } from './routes/schedule'
import { Maintenance } from './routes/maintenance'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })

function Router() {
  const { route } = useRoute()
  switch (route.path) {
    case '/': return <Home />
    case '/buildings/[slug]': return <BuildingDetail />
    case '/listings': return <Listings />
    case '/units/[id]': return <UnitDetail />
    case '/schedule': return <Schedule />
    case '/maintenance': return <Maintenance />
    case '/about': return <About />
    case '/contact': return <Contact />
    case '/privacy': return <Privacy />
    case '/terms': return <Terms />
    default: return <Home />
  }
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider>
        {platform === 'web' && <Header />}
        <Router />
        {platform === 'web' && <Footer />}
        {platform !== 'web' && <TabBar />}
      </RouterProvider>
    </QueryClientProvider>
  )
}
```

(The `Schedule` and `Maintenance` imports will fail until Tasks 11 and 12 — create stubs at the end of this task to keep the build green.)

- [ ] **Step 13: Stub Schedule and Maintenance**

Create `apps/lynx/src/routes/schedule.tsx`:

```tsx
export function Schedule() { return <text>Coming soon</text> }
```

Create `apps/lynx/src/routes/maintenance.tsx`:

```tsx
export function Maintenance() { return <text>Coming soon</text> }
```

- [ ] **Step 14: Run dev, smoke-test web pages**

```bash
pnpm --filter @ar/lynx dev
```

Visit `/`, `/listings`, `/buildings/grass-lake-manor`, `/about`, `/contact`. Each should render without errors.

- [ ] **Step 15: Commit**

```bash
git add apps/lynx/src
git commit -m "feat(lynx): layout, router, marketing pages, listings, unit detail with SEO"
```

---

## Task 11: Maintenance Request Form

**Files:**
- Create: `apps/lynx/src/components/TurnstileWidget.tsx`
- Create: `apps/lynx/src/components/PhotoUploader.tsx`
- Create: `apps/lynx/src/components/MaintenanceForm.tsx`
- Modify: `apps/lynx/src/routes/maintenance.tsx`

- [ ] **Step 1: Turnstile widget (web only; mobile uses a fallback token)**

Create `apps/lynx/src/components/TurnstileWidget.tsx`:

```tsx
import { useEffect, useRef } from '@lynx-js/react'
import { platform } from '../lib/platform'
import { env } from '../lib/env'

declare global { interface Window { turnstile?: any } }

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<any>(null)
  useEffect(() => {
    if (platform !== 'web') {
      // On mobile, dev path uses bypass key; production should use App Attest / Play Integrity (deferred to v1.5).
      onToken('mobile-dev-bypass-token')
      return
    }
    if (!document.querySelector('script[data-turnstile]')) {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      s.async = true
      s.setAttribute('data-turnstile', '1')
      document.head.appendChild(s)
    }
    const id = setInterval(() => {
      if (window.turnstile && ref.current) {
        clearInterval(id)
        window.turnstile.render(ref.current, {
          sitekey: env.VITE_TURNSTILE_SITE_KEY,
          callback: (token: string) => onToken(token),
        })
      }
    }, 100)
    return () => clearInterval(id)
  }, [onToken])
  if (platform !== 'web') return null
  return <view ref={ref} />
}
```

- [ ] **Step 2: Photo uploader**

Create `apps/lynx/src/components/PhotoUploader.tsx`:

```tsx
import { useState } from '@lynx-js/react'
import { env } from '../lib/env'

interface UploadResp {
  temp_id: string
  uploads: { path: string; signedUrl: string; token: string }[]
}

interface Props {
  turnstileToken: string | null
  onPathsChange: (paths: string[]) => void
}

export function PhotoUploader({ turnstileToken, onPathsChange }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [paths, setPaths] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function handlePick(e: any) {
    const picked = Array.from(e.target.files as FileList).slice(0, 5)
    setFiles(picked)
  }

  async function handleUpload() {
    if (!turnstileToken) { setError('Please complete the captcha'); return }
    if (files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const ct = files[0]!.type
      const r = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/request-upload-urls`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ count: files.length, content_type: ct, turnstile_token: turnstileToken }),
      })
      if (!r.ok) throw new Error(await r.text())
      const data = (await r.json()) as UploadResp
      for (let i = 0; i < files.length; i++) {
        const u = data.uploads[i]!
        const put = await fetch(u.signedUrl, { method: 'PUT', body: files[i]!, headers: { 'content-type': files[i]!.type, 'x-upsert': 'false' } })
        if (!put.ok) throw new Error(`upload ${i} failed`)
      }
      const finalPaths = data.uploads.map((u) => u.path)
      setPaths(finalPaths)
      onPathsChange(finalPaths)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <view>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple bindchange={handlePick} />
      <text style={{ color: '#666', fontSize: 12 }}>Up to 5 photos, JPEG/PNG/WebP, 10 MB each.</text>
      {files.length > 0 && paths.length === 0 && (
        <view bindtap={handleUpload} style={{ marginTop: 8, padding: 10, backgroundColor: '#0a58ca', borderRadius: 6, alignSelf: 'flex-start' }}>
          <text style={{ color: '#fff' }}>{uploading ? 'Uploading…' : `Upload ${files.length} photo(s)`}</text>
        </view>
      )}
      {paths.length > 0 && <text style={{ color: 'green', marginTop: 8 }}>{paths.length} photo(s) uploaded</text>}
      {error && <text style={{ color: 'red', marginTop: 8 }}>{error}</text>}
    </view>
  )
}
```

- [ ] **Step 3: Maintenance form**

Create `apps/lynx/src/components/MaintenanceForm.tsx`:

```tsx
import { useState } from '@lynx-js/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MaintenanceRequestInputSchema, type MaintenanceRequestInput } from '@ar/shared'
import { useBuildings } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { platform } from '../lib/platform'
import { TurnstileWidget } from './TurnstileWidget'
import { PhotoUploader } from './PhotoUploader'

export function MaintenanceForm() {
  const { data: buildings = [] } = useBuildings()
  const [turnstile, setTurnstile] = useState<string | null>(null)
  const [photoPaths, setPhotoPaths] = useState<string[]>([])
  const [submitted, setSubmitted] = useState<{ ref_id: string } | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue } = useForm<MaintenanceRequestInput>({
    resolver: zodResolver(MaintenanceRequestInputSchema),
    defaultValues: { source: platform, photo_paths: [], turnstile_token: '' },
  })

  async function onSubmit(values: MaintenanceRequestInput) {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .insert({
        ...values,
        photo_paths: photoPaths,
        turnstile_token: undefined as any, // not a column — strip
      })
      .select('ref_id')
      .single()
    if (error) { alert(error.message); return }
    setSubmitted({ ref_id: data!.ref_id })
  }

  if (submitted) {
    return (
      <view style={{ padding: 24, backgroundColor: '#e6f7ed', borderRadius: 12 }}>
        <text style={{ fontSize: 22, fontWeight: '700' }}>Request received</text>
        <text style={{ marginTop: 8 }}>Your reference is <text style={{ fontWeight: '700' }}>{submitted.ref_id}</text>. A property manager will follow up within one business day.</text>
      </view>
    )
  }

  return (
    <view style={{ gap: 12 }}>
      <text style={{ fontWeight: '600' }}>Building</text>
      <view style={{ flexDirection: 'row', gap: 8 }}>
        {buildings.map((b) => (
          <view key={b.id} bindtap={() => setValue('building_id', b.id, { shouldValidate: true })}
                style={{ padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' }}>
            <text>{b.name}</text>
          </view>
        ))}
      </view>
      {errors.building_id && <text style={{ color: 'red' }}>Pick a building</text>}

      <text style={{ fontWeight: '600' }}>Unit number</text>
      <input {...register('unit_number')} placeholder="e.g. 3B" style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }} />

      <text style={{ fontWeight: '600' }}>Your name</text>
      <input {...register('tenant_name')} style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }} />

      <text style={{ fontWeight: '600' }}>Email</text>
      <input {...register('tenant_email')} type="email" style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }} />

      <text style={{ fontWeight: '600' }}>Phone (optional if email provided)</text>
      <input {...register('tenant_phone')} type="tel" style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }} />

      <text style={{ fontWeight: '600' }}>Issue type</text>
      <select {...register('issue_type')} style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }}>
        <option value="">Select…</option>
        <option value="plumbing">Plumbing</option>
        <option value="electrical">Electrical</option>
        <option value="hvac">HVAC / heating / cooling</option>
        <option value="appliance">Appliance</option>
        <option value="pest">Pest</option>
        <option value="locks">Locks / keys</option>
        <option value="other">Other</option>
      </select>

      <text style={{ fontWeight: '600' }}>Urgency</text>
      <view style={{ flexDirection: 'row', gap: 8 }}>
        {(['low','normal','high','emergency'] as const).map((u) => (
          <view key={u} bindtap={() => setValue('urgency', u, { shouldValidate: true })}
                style={{ padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' }}>
            <text>{u}</text>
          </view>
        ))}
      </view>

      <text style={{ fontWeight: '600' }}>Description</text>
      <textarea {...register('description')} rows={4} style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }} />

      <text style={{ fontWeight: '600' }}>Photos (optional, up to 5)</text>
      <PhotoUploader turnstileToken={turnstile} onPathsChange={setPhotoPaths} />

      <TurnstileWidget onToken={(t) => { setTurnstile(t); setValue('turnstile_token', t) }} />

      <view bindtap={handleSubmit(onSubmit)} style={{ marginTop: 16, padding: 14, backgroundColor: '#0a58ca', borderRadius: 8, alignSelf: 'flex-start' }}>
        <text style={{ color: '#fff', fontWeight: '600' }}>{isSubmitting ? 'Submitting…' : 'Submit request'}</text>
      </view>
    </view>
  )
}
```

- [ ] **Step 4: Replace maintenance route**

Edit `apps/lynx/src/routes/maintenance.tsx`:

```tsx
import { MaintenanceForm } from '../components/MaintenanceForm'
import { SeoHead } from '../components/SeoHead'
export function Maintenance() {
  return (
    <view style={{ padding: 16, maxWidth: 720, marginHorizontal: 'auto' }}>
      <SeoHead title="Submit a maintenance request — AR Management" description="Tell us about a maintenance issue at your AR Management apartment." />
      <text style={{ fontSize: 28, fontWeight: '700', marginBottom: 16 }}>Maintenance request</text>
      <MaintenanceForm />
    </view>
  )
}
```

- [ ] **Step 5: Manual smoke test**

```bash
pnpm --filter @ar/lynx dev
# In another terminal:
supabase functions serve --env-file ./.env --no-verify-jwt
```

In browser at `/maintenance`: pick a building, fill the form (skip photos for first pass), submit. Verify:
1. The form posts successfully (success screen with ref_id appears).
2. A row exists: `psql $(supabase status -o env | grep DB_URL | cut -d= -f2-) -c "select id, ref_id, status from maintenance_requests;"`.
3. The Edge Function log shows invocation; if Resend creds are set, manager email is delivered.

- [ ] **Step 6: Commit**

```bash
git add apps/lynx/src/components apps/lynx/src/routes/maintenance.tsx
git commit -m "feat(lynx): maintenance request form with photo upload + Turnstile"
```

---

## Task 12: Schedule-a-Showing Form

**Files:**
- Create: `apps/lynx/src/components/SlotPicker.tsx`
- Create: `apps/lynx/src/components/ShowingForm.tsx`
- Modify: `apps/lynx/src/routes/schedule.tsx`
- Modify: `apps/lynx/src/lib/queries.ts`

- [ ] **Step 1: Add slot query**

Append to `apps/lynx/src/lib/queries.ts`:

```ts
export function useOpenSlots(building_id: string | undefined) {
  return useQuery({
    queryKey: ['slots', building_id ?? 'none'],
    queryFn: async () => {
      if (!building_id) return []
      const { data, error } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('building_id', building_id)
        .eq('status', 'open')
        .gt('starts_at', new Date().toISOString())
        .order('starts_at')
      if (error) throw error
      return data ?? []
    },
    enabled: !!building_id,
  })
}
```

- [ ] **Step 2: SlotPicker component**

Create `apps/lynx/src/components/SlotPicker.tsx`:

```tsx
interface Slot { id: string; starts_at: string; ends_at: string }
interface Props { slots: Slot[]; selected: string | null; onSelect: (id: string) => void }
export function SlotPicker({ slots, selected, onSelect }: Props) {
  if (slots.length === 0) return <text style={{ color: '#666' }}>No published slots — propose preferred dates below.</text>
  return (
    <view style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {slots.map((s) => {
        const t = new Date(s.starts_at)
        const label = t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        const active = selected === s.id
        return (
          <view key={s.id} bindtap={() => onSelect(s.id)}
                style={{ padding: 10, borderRadius: 6, borderWidth: 1, borderColor: active ? '#0a58ca' : '#ccc', backgroundColor: active ? '#0a58ca' : '#fff' }}>
            <text style={{ color: active ? '#fff' : '#333' }}>{label}</text>
          </view>
        )
      })}
    </view>
  )
}
```

- [ ] **Step 3: Showing form**

Create `apps/lynx/src/components/ShowingForm.tsx`:

```tsx
import { useState } from '@lynx-js/react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShowingRequestInputSchema, type ShowingRequestInput } from '@ar/shared'
import { useBuildings, useOpenSlots, useUnitById } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { platform } from '../lib/platform'
import { TurnstileWidget } from './TurnstileWidget'
import { SlotPicker } from './SlotPicker'

export function ShowingForm({ initialUnitId }: { initialUnitId?: string }) {
  const { data: unit } = useUnitById(initialUnitId ?? '')
  const initialBuilding = unit?.building?.id
  const [building_id, setBuildingId] = useState<string | undefined>(initialBuilding)
  const { data: buildings = [] } = useBuildings()
  const { data: slots = [] } = useOpenSlots(building_id)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [d1, setD1] = useState(''); const [d2, setD2] = useState(''); const [d3, setD3] = useState('')
  const [turnstile, setTurnstile] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ ref_id: string } | null>(null)

  const { register, handleSubmit, setValue } = useForm<ShowingRequestInput>({
    resolver: zodResolver(ShowingRequestInputSchema),
    defaultValues: {
      source: platform, building_id: initialBuilding ?? '', unit_id: initialUnitId ?? null,
      slot_id: null, preferred_dates: null, turnstile_token: '',
    },
  })

  async function onSubmit(values: ShowingRequestInput) {
    const dates = [d1, d2, d3].filter(Boolean)
    const payload: any = {
      ...values,
      building_id: building_id!,
      unit_id: initialUnitId ?? null,
      slot_id: slotId,
      preferred_dates: slotId ? null : dates,
      turnstile_token: undefined,
    }
    const { data, error } = await supabase.from('showing_requests').insert(payload).select('ref_id').single()
    if (error) { alert(error.message); return }
    setSubmitted({ ref_id: data!.ref_id })
  }

  if (submitted) {
    return (
      <view style={{ padding: 24, backgroundColor: '#e6f7ed', borderRadius: 12 }}>
        <text style={{ fontSize: 22, fontWeight: '700' }}>Showing request received</text>
        <text style={{ marginTop: 8 }}>Reference <text style={{ fontWeight: '700' }}>{submitted.ref_id}</text>. We'll confirm a time within one business day.</text>
      </view>
    )
  }

  return (
    <view style={{ gap: 12 }}>
      <text style={{ fontWeight: '600' }}>Building</text>
      <view style={{ flexDirection: 'row', gap: 8 }}>
        {buildings.map((b) => (
          <view key={b.id} bindtap={() => { setBuildingId(b.id); setValue('building_id', b.id) }}
                style={{ padding: 10, borderRadius: 6, borderWidth: 1, borderColor: building_id === b.id ? '#0a58ca' : '#ccc', backgroundColor: building_id === b.id ? '#0a58ca' : '#fff' }}>
            <text style={{ color: building_id === b.id ? '#fff' : '#333' }}>{b.name}</text>
          </view>
        ))}
      </view>

      <text style={{ fontWeight: '600' }}>Pick a slot</text>
      <SlotPicker slots={slots} selected={slotId} onSelect={(id) => { setSlotId(id); setValue('slot_id', id); setValue('preferred_dates', null) }} />

      <text style={{ fontWeight: '600' }}>…or propose up to 3 preferred dates</text>
      <view style={{ flexDirection: 'row', gap: 8 }}>
        <input type="date" bindchange={(e: any) => setD1(e.target.value)} />
        <input type="date" bindchange={(e: any) => setD2(e.target.value)} />
        <input type="date" bindchange={(e: any) => setD3(e.target.value)} />
      </view>

      <text style={{ fontWeight: '600' }}>Your name</text>
      <input {...register('prospect_name')} style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }} />

      <text style={{ fontWeight: '600' }}>Email</text>
      <input {...register('prospect_email')} type="email" style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }} />

      <text style={{ fontWeight: '600' }}>Phone (optional)</text>
      <input {...register('prospect_phone')} type="tel" style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }} />

      <text style={{ fontWeight: '600' }}>Message (optional)</text>
      <textarea {...register('message')} rows={3} style={{ padding: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4 }} />

      <TurnstileWidget onToken={(t) => { setTurnstile(t); setValue('turnstile_token', t) }} />

      <view bindtap={handleSubmit(onSubmit)} style={{ marginTop: 16, padding: 14, backgroundColor: '#0a58ca', borderRadius: 8, alignSelf: 'flex-start' }}>
        <text style={{ color: '#fff', fontWeight: '600' }}>Request showing</text>
      </view>
    </view>
  )
}
```

- [ ] **Step 4: Schedule route**

Edit `apps/lynx/src/routes/schedule.tsx`:

```tsx
import { ShowingForm } from '../components/ShowingForm'
import { SeoHead } from '../components/SeoHead'
import { platform } from '../lib/platform'

export function Schedule() {
  let unitId: string | undefined
  if (platform === 'web') {
    const sp = new URLSearchParams(location.search)
    unitId = sp.get('unit') ?? undefined
  }
  return (
    <view style={{ padding: 16, maxWidth: 720, marginHorizontal: 'auto' }}>
      <SeoHead title="Schedule a showing — AR Management" description="Pick a tour time at Grass Lake Manor or Winnetka Manor." />
      <text style={{ fontSize: 28, fontWeight: '700', marginBottom: 16 }}>Schedule a showing</text>
      <ShowingForm initialUnitId={unitId} />
    </view>
  )
}
```

- [ ] **Step 5: Smoke test**

Visit `/schedule` and `/units/<id>` → click Schedule. Submit a request with preferred dates. Verify a row in `showing_requests` and a fan-out email (if Resend configured).

- [ ] **Step 6: Commit**

```bash
git add apps/lynx/src
git commit -m "feat(lynx): schedule-a-showing form with slot picker + preferred dates"
```

---

## Task 13: Sitemap, Robots, and Health Endpoint

**Files:**
- Create: `apps/lynx/public/robots.txt`
- Create: `apps/lynx/src/server/sitemap.ts`
- Create: `supabase/functions/health/index.ts`

- [ ] **Step 1: robots.txt**

Create `apps/lynx/public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://__PRODUCTION_DOMAIN__/sitemap.xml
```

> Replace `__PRODUCTION_DOMAIN__` at deploy time via a small build script (Step 3 below).

- [ ] **Step 2: Sitemap generator**

Create `apps/lynx/src/server/sitemap.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

export async function generateSitemap(domain: string, supabaseUrl: string, anonKey: string): Promise<string> {
  const sb = createClient(supabaseUrl, anonKey)
  const [{ data: buildings }, { data: units }] = await Promise.all([
    sb.from('buildings').select('slug, updated_at').eq('is_published', true),
    sb.from('units').select('id, updated_at').in('status', ['available','coming_soon']),
  ])
  const staticUrls = ['/', '/listings', '/about', '/contact', '/privacy', '/terms']
  const buildingUrls = (buildings ?? []).map((b) => `/buildings/${b.slug}`)
  const unitUrls = (units ?? []).map((u) => `/units/${u.id}`)
  const all = [...staticUrls, ...buildingUrls, ...unitUrls]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map((p) => `  <url><loc>${domain}${p}</loc></url>`).join('\n')}
</urlset>`
  return xml
}
```

- [ ] **Step 3: Wire sitemap into the build**

Add to `apps/lynx/package.json` scripts:

```json
"postbuild": "node scripts/generate-sitemap.mjs"
```

Create `apps/lynx/scripts/generate-sitemap.mjs`:

```js
import { writeFileSync, readFileSync } from 'node:fs'
import { generateSitemap } from '../src/server/sitemap.ts'

const domain = process.env.PRODUCTION_DOMAIN ?? 'https://ar-management.example'
const xml = await generateSitemap(domain, process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
writeFileSync('dist/sitemap.xml', xml)
const robots = readFileSync('public/robots.txt', 'utf8').replaceAll('__PRODUCTION_DOMAIN__', domain.replace(/^https?:\/\//, ''))
writeFileSync('dist/robots.txt', robots)
console.log('sitemap + robots written')
```

(If running `.ts` from Node directly is awkward, compile to `.mjs` first or use `tsx`.)

- [ ] **Step 4: Health Edge Function**

Create `supabase/functions/health/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async () => {
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error } = await sb.from('buildings').select('id').limit(1)
    if (error) throw error
    return Response.json({ ok: true, ts: new Date().toISOString() })
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503 })
  }
})
```

- [ ] **Step 5: Commit**

```bash
git add apps/lynx/public apps/lynx/src/server apps/lynx/scripts apps/lynx/package.json supabase/functions/health
git commit -m "feat: sitemap, robots, health check endpoint"
```

---

## Task 14: Sentry Wiring

**Files:**
- Create: `apps/lynx/src/lib/sentry.ts`
- Modify: `apps/lynx/src/App.tsx`

- [ ] **Step 1: Install Sentry**

```bash
pnpm --filter @ar/lynx add @sentry/browser
```

(Native Sentry SDK selection depends on Lynx integration; the spike's `SPIKE-NOTES.md` should record whether `@sentry/react-native` works in Lynx. If not, ship `@sentry/browser` for web only and skip native error reporting in v1 — track as `OPEN-6`.)

- [ ] **Step 2: Sentry init module**

Create `apps/lynx/src/lib/sentry.ts`:

```ts
import * as Sentry from '@sentry/browser'
import { env } from './env'
import { platform } from './platform'

export function initSentry() {
  if (!env.VITE_SENTRY_DSN) return
  if (platform !== 'web') return // see OPEN-6
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
  })
}
```

- [ ] **Step 3: Call initSentry early in App.tsx**

Add to top of `apps/lynx/src/App.tsx` after imports:

```tsx
import { initSentry } from './lib/sentry'
initSentry()
```

- [ ] **Step 4: Commit**

```bash
git add apps/lynx/src/lib/sentry.ts apps/lynx/src/App.tsx apps/lynx/package.json
git commit -m "feat(lynx): Sentry init for web (mobile deferred — OPEN-6)"
```

---

## Task 15: Tests — Unit, E2E, Accessibility

**Files:**
- Create: `apps/lynx/vitest.config.ts`
- Create: `apps/lynx/playwright.config.ts`
- Create: `apps/lynx/tests/unit/platform.test.ts`
- Create: `apps/lynx/tests/e2e/browse-listings.spec.ts`
- Create: `apps/lynx/tests/e2e/submit-maintenance.spec.ts`
- Create: `apps/lynx/tests/e2e/submit-showing.spec.ts`
- Create: `apps/lynx/tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Vitest config**

Create `apps/lynx/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
})
```

- [ ] **Step 2: Playwright config**

Create `apps/lynx/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
})
```

- [ ] **Step 3: Platform unit test**

Create `apps/lynx/tests/unit/platform.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { detectPlatform } from '../../src/lib/platform'

describe('detectPlatform', () => {
  it('defaults to web in node test environment', () => {
    expect(detectPlatform()).toBe('web')
  })
})
```

- [ ] **Step 4: E2E browse listings**

Create `apps/lynx/tests/e2e/browse-listings.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('home page shows both buildings', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Grass Lake Manor/i)).toBeVisible()
  await expect(page.getByText(/Winnetka Manor/i)).toBeVisible()
})

test('listings page filters by building', async ({ page }) => {
  await page.goto('/listings')
  await expect(page.getByText(/Available apartments/i)).toBeVisible()
  await page.getByText('Grass Lake Manor', { exact: false }).first().click()
  // No assertion on count — depends on seed data — but page should not error
  await expect(page.locator('body')).not.toContainText(/Error:/)
})
```

- [ ] **Step 5: E2E submit maintenance request**

Create `apps/lynx/tests/e2e/submit-maintenance.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('submits maintenance request and shows ref id', async ({ page }) => {
  await page.goto('/maintenance')
  await page.getByText('Grass Lake Manor', { exact: false }).first().click()
  await page.getByPlaceholder('e.g. 3B').fill('3B')
  await page.locator('input[type="email"]').fill('e2e@example.com')
  await page.locator('input[name="tenant_name"], input').nth(0).fill('E2E Tester') // best-effort selector
  await page.locator('select').selectOption('plumbing')
  await page.getByText('normal').click()
  await page.locator('textarea').fill('End-to-end test description for the maintenance form.')
  // Skip Turnstile in dev (use bypass key in env)
  await page.getByText(/Submit request/i).click()
  await expect(page.getByText(/Request received/i)).toBeVisible({ timeout: 10_000 })
})
```

- [ ] **Step 6: E2E submit showing**

Create `apps/lynx/tests/e2e/submit-showing.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('submits showing request with preferred date', async ({ page }) => {
  await page.goto('/schedule')
  await page.getByText('Grass Lake Manor', { exact: false }).first().click()
  await page.locator('input[type="date"]').first().fill('2026-07-01')
  await page.locator('input[name="prospect_name"], input').first().fill('Prospect Tester')
  await page.locator('input[type="email"]').fill('prospect@example.com')
  await page.getByText(/Request showing/i).click()
  await expect(page.getByText(/Showing request received/i)).toBeVisible({ timeout: 10_000 })
})
```

- [ ] **Step 7: A11y test**

Create `apps/lynx/tests/e2e/a11y.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const routes = ['/', '/listings', '/buildings/grass-lake-manor', '/about', '/contact']
for (const r of routes) {
  test(`a11y: ${r}`, async ({ page }) => {
    await page.goto(r)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
}
```

- [ ] **Step 8: Run tests**

```bash
pnpm --filter @ar/lynx test
pnpm --filter @ar/lynx exec playwright install --with-deps chromium webkit
pnpm --filter @ar/lynx test:e2e
```

Expected: unit tests pass; E2E tests pass against the local dev server (run `pnpm --filter @ar/lynx dev` in another terminal).

- [ ] **Step 9: Commit**

```bash
git add apps/lynx/vitest.config.ts apps/lynx/playwright.config.ts apps/lynx/tests
git commit -m "test(lynx): vitest + playwright + axe-playwright covering golden paths"
```

---

## Task 16: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write CI workflow**

Create `/home/mocap/AR_management/.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint-typecheck-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test

  e2e:
    runs-on: ubuntu-latest
    needs: lint-typecheck-test
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_PASSWORD: postgres }
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: pnpm install --frozen-lockfile
      - run: supabase start
        working-directory: .
      - run: pnpm --filter @ar/lynx exec playwright install --with-deps chromium webkit
      - run: pnpm --filter @ar/lynx dev &
      - run: |
          for i in {1..30}; do curl -sSf http://localhost:3000 > /dev/null && break; sleep 2; done
      - run: pnpm --filter @ar/lynx test:e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/lynx/playwright-report/
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint + typecheck + unit + e2e on PR and main"
```

---

## Task 17: Vercel Deploy + Production Supabase

**Files:**
- Create: `apps/lynx/vercel.json`
- Create: `.github/workflows/deploy-web.yml`

- [ ] **Step 1: Vercel config**

Create `apps/lynx/vercel.json`:

```json
{
  "buildCommand": "pnpm --filter @ar/lynx build",
  "outputDirectory": "apps/lynx/dist",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": null,
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

> If rspeedy SSR works (per spike), drop the `rewrites` entry — it's a SPA fallback.

- [ ] **Step 2: User-action checklist for Vercel + Supabase prod**

Document these manual steps in `/home/mocap/AR_management/docs/superpowers/runbooks/launch.md`:

```markdown
# Launch Runbook

## One-time setup (user action required)

1. Create Vercel account, link this GitHub repo, import as new project. Project root: `apps/lynx`.
2. Set Vercel env vars (Production scope):
   - `VITE_SUPABASE_URL`         — the production Supabase URL
   - `VITE_SUPABASE_ANON_KEY`    — production anon key
   - `VITE_TURNSTILE_SITE_KEY`   — Cloudflare Turnstile production key
   - `VITE_SENTRY_DSN`           — Sentry project DSN
3. Create production Supabase project (`ar-mgmt-prod`) at supabase.com, US-East.
4. From repo root: `supabase link --project-ref <prod-ref>` then `supabase db push` to apply migrations.
5. Apply seed: `psql "<prod-db-url>" < supabase/seed.sql` (after editing real addresses + manager emails).
6. Set Supabase Edge Function secrets:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (auto)
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
   - `TURNSTILE_SECRET_KEY`
   - `EMERGENCY_WEBHOOK_URL` (optional)
7. Configure Postgres `app.edge_functions_url` and `app.anon_key` settings against the production database.
8. Deploy Edge Functions: `supabase functions deploy notify-on-new-request request-upload-urls health`.
9. Add custom domain to Vercel; point DNS A/CNAME records.
10. Verify Resend sending domain DNS (DKIM, SPF) records.
11. First-deploy QA matrix: run the manual mobile QA checklist (Task 18 deliverable).
```

- [ ] **Step 3: Auto-deploy workflow**

Create `.github/workflows/deploy-web.yml`:

```yaml
name: Deploy Web (production)
on:
  push:
    branches: [main]

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROD_REF }}
        env: { SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }} }
      - run: supabase db push
        env: { SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }} }
      - run: supabase functions deploy notify-on-new-request request-upload-urls health
        env: { SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }} }
  # Vercel auto-deploys via its GitHub integration; no step needed.
```

- [ ] **Step 4: Commit**

```bash
git add apps/lynx/vercel.json .github/workflows/deploy-web.yml docs/superpowers/runbooks/launch.md
git commit -m "deploy: Vercel config + supabase migration workflow + launch runbook"
```

---

## Task 18: Mobile Build (EAS) + QA Matrix

**Files:**
- Create: `/home/mocap/AR_management/eas.json`
- Create: `/home/mocap/AR_management/docs/superpowers/runbooks/mobile-qa.md`

- [ ] **Step 1: EAS config**

Create `/home/mocap/AR_management/eas.json`:

```json
{
  "cli": { "version": ">= 5.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "preview": {
      "distribution": "internal",
      "channel": "staging"
    },
    "production": {
      "channel": "production",
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": { "ascAppId": "__APP_STORE_CONNECT_ID__" },
      "android": { "track": "production" }
    }
  }
}
```

> `__APP_STORE_CONNECT_ID__` is filled after the App Store Connect record is created (`OPEN-4`).

- [ ] **Step 2: Mobile QA runbook**

Create `/home/mocap/AR_management/docs/superpowers/runbooks/mobile-qa.md`:

```markdown
# Mobile QA Matrix (per release)

| Platform | Device | Tester | Result |
|---|---|---|---|
| iOS | iPhone 15 (latest iOS) | | ☐ pass / ☐ fail |
| iOS | iPhone SE (oldest supported) | | ☐ pass / ☐ fail |
| Android | Pixel 8 (latest Android) | | ☐ pass / ☐ fail |
| Android | Samsung Galaxy A14 (mid-tier) | | ☐ pass / ☐ fail |

## Per-device golden-path checklist

1. Cold-launch the app. Home renders within 3 seconds. ☐
2. Open Listings. Both buildings appear. ☐
3. Tap into a unit. Photos render. Schedule a showing button visible. ☐
4. Tap Schedule a showing. Submit a request with preferred dates. See success screen with ref id. ☐
5. Receive confirmation email within 60 seconds. ☐
6. Open Maintenance tab. Submit a request with one photo from camera. See success screen. ☐
7. Verify photo appears in Supabase Storage `maintenance-uploads` bucket within 30 seconds. ☐
8. Background the app for 10 minutes, foreground it. State preserved or graceful re-fetch. ☐
9. Airplane mode toggle: error message visible and recoverable. ☐
```

- [ ] **Step 3: Commit**

```bash
git add eas.json docs/superpowers/runbooks/mobile-qa.md
git commit -m "ops: EAS config + mobile QA matrix"
```

---

## Task 19: Pre-Launch Checklist

**Files:**
- Create: `/home/mocap/AR_management/docs/superpowers/runbooks/pre-launch.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Pre-Launch Checklist

## Open items resolved
- [ ] OPEN-1 Production domain confirmed and DNS configured
- [ ] OPEN-2 Manager email allowlist seeded (real emails replace dev placeholder)
- [ ] OPEN-3 Real building photos uploaded to `public-photos`
- [ ] OPEN-4 Apple Developer + Google Play accounts active
- [ ] OPEN-5 Resend sending domain verified (DKIM, SPF green)

## Database
- [ ] All migrations applied to production Supabase project
- [ ] Seed file edited with real addresses + city + zip + manager emails
- [ ] RLS verified via SQL probe (anon insert into buildings → denied)
- [ ] Audit log triggers firing (insert one test row, verify audit row exists)

## Edge Functions
- [ ] `request-upload-urls`, `notify-on-new-request`, `health` deployed
- [ ] Function secrets set (Resend, Turnstile, service role)
- [ ] `app.edge_functions_url` and `app.anon_key` Postgres settings configured
- [ ] End-to-end test: insert a maintenance row → manager email arrives within 30s

## Web
- [ ] Vercel project pointed at production domain
- [ ] HTTPS active, redirect HTTP→HTTPS
- [ ] Lighthouse mobile Performance ≥ 80 on `/buildings/grass-lake-manor`
- [ ] sitemap.xml accessible at `/sitemap.xml`
- [ ] robots.txt accessible at `/robots.txt`
- [ ] Sentry receiving events (manually trigger an error)

## Mobile
- [ ] EAS production build succeeded for iOS and Android
- [ ] TestFlight build distributed to internal testers
- [ ] Play Internal Track build distributed
- [ ] Mobile QA matrix completed (4 devices × 9 checklist items)
- [ ] Submitted to App Store and Play Store with real screenshots + listings copy

## Observability
- [ ] BetterStack (or Vercel uptime) monitoring `/api/health` every minute
- [ ] Sentry alerts to manager email
- [ ] Resend webhook configured for bounce notifications

## Legal
- [ ] Privacy and Terms reviewed by counsel
- [ ] Fair-housing disclaimer appears on listings (if required by jurisdiction)
- [ ] GDPR / CCPA notice present (if applicable)

## Cutover
- [ ] Announce launch in any internal channels
- [ ] Update business cards / signage with new URL
- [ ] Update Google Business Profile with new website link
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/runbooks/pre-launch.md
git commit -m "ops: pre-launch checklist"
```

---

## Self-Review

**1. Spec coverage check:**

| Spec section | Plan task(s) |
|---|---|
| 1 Goals & non-goals | Plan goal section + Task 19 checklist |
| 2 Architecture | Tasks 0, 1, 9, 17 |
| 3 Data model | Tasks 4, 6 |
| 4 Public screens | Tasks 9, 10, 11, 12 |
| 5 Manager workflow (Studio) | Task 6 (allowlist) + Task 19 (production setup) |
| 6 Auth, RLS, storage | Tasks 5, 7 |
| 7 Email notifications | Task 8 |
| 8 SEO, perf, a11y | Tasks 10 (SEO meta), 13 (sitemap/robots), 15 (a11y), 19 (Lighthouse gate) |
| 9 Deployment & environments | Tasks 16, 17 |
| 10 Testing | Task 15 |
| 11 Observability | Tasks 13 (health), 14 (Sentry), 19 |
| 12 Out of scope | Plan respects all YAGNI items — none added |
| 13 Risks | Task 1 (spike covers R1, R2, R3, R4); Tasks 18+19 (R5–R7); Task 7 (R8); manual flow (R9 acknowledged) |
| 14 Implementation phasing | Direct mapping: Step 0→Task 1, Step 1→Tasks 0/2/3, Step 2→Tasks 4/5/6/9/10, Step 3→Tasks 7/8/11, Step 4→Task 12, Step 5→Tasks 13/14, Step 6→Task 18, Step 7→Tasks 17/19 |
| 15 Repo layout | Tasks 0, 2, 3 (matches the proposed structure) |

No spec sections lack a task.

**2. Placeholder scan:** Searched the plan for `TBD`, `TODO`, `__SOMETHING__`. All `__PLACEHOLDER__` markers (`__ADDRESS_TBD__`, `__CITY__`, `__ZIP__`, `__APP_STORE_CONNECT_ID__`, `__PRODUCTION_DOMAIN__`) are either:
- explicitly tracked open items (`OPEN-1`–`OPEN-5`) the user must provide, or
- documented in seed comments and runbooks as "fill before production".

These are not plan failures — they are user-input placeholders gated to a launch checklist.

**3. Type / name consistency:**
- `MaintenanceRequestInput` defined in Task 2, used in Task 11. ✅
- `ShowingRequestInput` defined in Task 2, used in Task 12. ✅
- `useBuildings`, `useBuildingBySlug`, `useAvailableUnits`, `useUnitById`, `useOpenSlots` all defined in Tasks 9 and 12, used consistently in pages. ✅
- `generateRefId` defined in Task 2 (8 chars, ambiguous-char-free). The DB also auto-generates a `ref_id` via `set_ref_id()` trigger in Task 8 using `md5` substring — these are independent generators (the DB one is authoritative; the shared utility is unused in the public flows but available for any client-side code that needs a similar id). Acceptable but flagged: if the engineer is confused about which to use, the answer is "the DB one is authoritative; do not override `ref_id` from the client."
- `corsHeaders`, `sendEmail`, `renderManagerNotification`, `renderSubmitterConfirmation` all defined in Task 8 with shared types, used only by the Edge Function in Task 8. ✅
- `platform`, `detectPlatform` defined in Task 9, used in Tasks 10, 11, 14. ✅
- `RouterProvider`, `useRoute` defined in Task 10, used throughout components and pages. ✅
- `TurnstileWidget`, `PhotoUploader` defined in Task 11, used in Task 11; `TurnstileWidget` also used in Task 12. ✅

No inconsistencies found.

---

**End of plan.**
