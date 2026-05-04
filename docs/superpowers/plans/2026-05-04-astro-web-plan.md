# AR Management — Astro Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public web app (`apps/web/`) using Astro 5 + Tailwind + React islands, replacing the parked Lynx web target. Reuses the existing Supabase backend, Edge Functions, and `@ar/shared` schemas.

**Architecture:** Astro 5 (file-based routing, SSG by default, SSR for filtered pages), TypeScript strict, Tailwind v4, React 19 islands for forms, `@astrojs/vercel` adapter, `@astrojs/sitemap` for SEO, `@sentry/astro` for errors. Forms POST to Supabase anon client (RLS allows insert); photo uploads go through the existing `request-upload-urls` Edge Function. Manager triage stays in Supabase Studio.

**Tech Stack:** Astro 5, React 19, Tailwind CSS v4, TypeScript 5, `@supabase/supabase-js`, react-hook-form, Zod (from `@ar/shared`), `@sentry/astro`, `@astrojs/sitemap`, `@astrojs/vercel`, Vitest, Playwright, axe-playwright.

**Spec:** `docs/superpowers/specs/2026-05-04-astro-web-spec.md`

**Estimated effort:** 2–3 weeks.

---

## File Structure (locked)

```
apps/web/
├── package.json                  # @ar/web, scripts dev/build/test/test:e2e/typecheck/lint
├── astro.config.mjs              # integrations: react, tailwind, sitemap, vercel, sentry
├── tsconfig.json                 # extends astro/tsconfigs/strict
├── tailwind.config.mjs
├── playwright.config.ts
├── vitest.config.ts
├── public/
│   └── favicon.svg
├── src/
│   ├── env.d.ts                  # Astro types
│   ├── lib/
│   │   ├── supabase.ts           # createClient (anon)
│   │   ├── supabase-admin.ts     # createClient (service role) — server-only
│   │   ├── env.ts                # zod-validated env
│   │   ├── photo-url.ts          # builds public-photos URLs
│   │   └── analytics.ts          # source detection helper
│   ├── styles/
│   │   └── global.css            # tailwind base
│   ├── layouts/
│   │   └── Base.astro            # <html>, <head>, <body>, header+footer
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── Seo.astro             # title/description/og/twitter/jsonLd props
│   │   ├── BuildingCard.astro
│   │   ├── UnitCard.astro
│   │   ├── PhotoGallery.astro
│   │   ├── AmenityList.astro
│   │   └── islands/
│   │       ├── FilterChips.tsx
│   │       ├── TurnstileWidget.tsx
│   │       ├── PhotoUploader.tsx
│   │       ├── MaintenanceForm.tsx
│   │       └── ShowingForm.tsx
│   └── pages/
│       ├── index.astro
│       ├── buildings/[slug].astro
│       ├── listings.astro
│       ├── units/[id].astro
│       ├── schedule.astro
│       ├── maintenance.astro
│       ├── about.astro
│       ├── contact.astro
│       ├── privacy.astro
│       ├── terms.astro
│       ├── robots.txt.ts         # dynamic robots
│       └── api/
│           └── health.ts         # health endpoint
└── tests/
    ├── unit/
    │   └── photo-url.test.ts
    └── e2e/
        ├── browse.spec.ts
        ├── submit-maintenance.spec.ts
        ├── submit-showing.spec.ts
        └── a11y.spec.ts
```

---

## Task A1: Scaffold Astro App

**Files:**
- Create: `apps/web/` (entire directory via `npm create astro@latest`)
- Modify: `apps/web/package.json` (rename to `@ar/web`)

- [ ] **Step 1: Scaffold Astro non-interactively**

```bash
cd /home/mocap/AR_management/apps
npm create astro@latest -- web --template minimal --typescript strict --install no --git no --skip-houston
```

Verify `apps/web/package.json`, `apps/web/astro.config.mjs`, `apps/web/src/pages/index.astro` exist.

- [ ] **Step 2: Rename package**

Edit `apps/web/package.json` — change `"name"` to `"@ar/web"` and ensure scripts include:

```json
{
  "name": "@ar/web",
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "start": "astro dev",
    "typecheck": "astro check",
    "lint": "eslint . --ext .astro,.ts,.tsx",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 3: Add core deps**

```bash
cd /home/mocap/AR_management
pnpm --filter @ar/web add astro @astrojs/react @astrojs/sitemap @astrojs/vercel @sentry/astro
pnpm --filter @ar/web add @tailwindcss/vite tailwindcss
pnpm --filter @ar/web add react react-dom @types/react @types/react-dom
pnpm --filter @ar/web add @supabase/supabase-js
pnpm --filter @ar/web add react-hook-form @hookform/resolvers
pnpm --filter @ar/web add @ar/shared@workspace:*
pnpm --filter @ar/web add -D vitest @playwright/test @axe-core/playwright eslint
```

- [ ] **Step 4: Verify install + boot dev server briefly**

```bash
pnpm --filter @ar/web dev &
sleep 8
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:4321/
pkill -f "astro dev"
```

Expected: `HTTP 200` (Astro default port is 4321 unless configured).

- [ ] **Step 5: Commit**

```bash
cd /home/mocap/AR_management
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Astro app with React + Tailwind + Supabase deps"
```

---

## Task A2: Astro Config (Tailwind, Vercel, Sitemap, Sentry, Integrations)

**Files:**
- Modify: `apps/web/astro.config.mjs`
- Create: `apps/web/src/styles/global.css`
- Modify: `apps/web/tsconfig.json`

- [ ] **Step 1: Replace astro.config.mjs**

```js
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import vercel from '@astrojs/vercel'
import tailwindcss from '@tailwindcss/vite'
import sentry from '@sentry/astro'

const SITE = process.env.PUBLIC_SITE_URL ?? 'https://ar-management.example'

export default defineConfig({
  site: SITE,
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: false },
  }),
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes('/api/') && !page.endsWith('/robots.txt'),
    }),
    ...(process.env.PUBLIC_SENTRY_DSN ? [sentry({
      dsn: process.env.PUBLIC_SENTRY_DSN,
      sourceMapsUploadOptions: { project: 'ar-web', authToken: process.env.SENTRY_AUTH_TOKEN },
    })] : []),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
```

- [ ] **Step 2: Tailwind global stylesheet**

Create `apps/web/src/styles/global.css`:

```css
@import "tailwindcss";

:root {
  --color-brand: #0a58ca;
  --color-brand-dark: #0747a6;
}

html { scroll-behavior: smooth; }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff; }
```

- [ ] **Step 3: Strict tsconfig**

Edit `apps/web/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 4: Build to verify config works**

```bash
pnpm --filter @ar/web build
```

Expected: `dist/` contains `index.html`, `_astro/`, `sitemap-*.xml`. (If sentry is missing DSN env var, build still succeeds because sentry is conditionally added.)

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): astro config — react, tailwind, sitemap, vercel adapter, sentry"
```

---

## Task A3: Env + Supabase Clients + Helpers

**Files:**
- Create: `apps/web/src/lib/env.ts`
- Create: `apps/web/src/lib/supabase.ts`
- Create: `apps/web/src/lib/supabase-admin.ts`
- Create: `apps/web/src/lib/photo-url.ts`
- Create: `apps/web/tests/unit/photo-url.test.ts`

- [ ] **Step 1: Write the failing test for photo-url**

Create `apps/web/tests/unit/photo-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { publicPhotoUrl, transformedPhotoUrl } from '../../src/lib/photo-url'

const BASE = 'https://example.supabase.co'

describe('publicPhotoUrl', () => {
  it('builds a public bucket URL', () => {
    expect(publicPhotoUrl(BASE, 'units/abc/0.jpg'))
      .toBe('https://example.supabase.co/storage/v1/object/public/public-photos/units/abc/0.jpg')
  })
})

describe('transformedPhotoUrl', () => {
  it('builds a render/image URL with width and quality', () => {
    expect(transformedPhotoUrl(BASE, 'units/abc/0.jpg', { width: 1600, quality: 75, format: 'webp' }))
      .toBe('https://example.supabase.co/storage/v1/render/image/public/public-photos/units/abc/0.jpg?width=1600&quality=75&format=webp')
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
pnpm --filter @ar/web test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement env.ts**

```ts
import { ClientEnvSchema, ServerEnvSchema } from '@ar/shared'

export const clientEnv = ClientEnvSchema.parse({
  VITE_SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  VITE_TURNSTILE_SITE_KEY: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
  VITE_SENTRY_DSN: import.meta.env.PUBLIC_SENTRY_DSN,
})

export function serverEnv() {
  return ServerEnvSchema.parse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    EMERGENCY_WEBHOOK_URL: process.env.EMERGENCY_WEBHOOK_URL,
  })
}
```

- [ ] **Step 4: Implement supabase clients**

`apps/web/src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { clientEnv } from './env'

export const supabase = createClient(clientEnv.VITE_SUPABASE_URL, clientEnv.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
```

`apps/web/src/lib/supabase-admin.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { serverEnv } from './env'

export function getAdminClient() {
  const env = serverEnv()
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

- [ ] **Step 5: Implement photo-url helper**

`apps/web/src/lib/photo-url.ts`:

```ts
export function publicPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/public-photos/${path}`
}

interface TransformOpts {
  width?: number
  quality?: number
  format?: 'webp' | 'jpg' | 'png'
}

export function transformedPhotoUrl(supabaseUrl: string, path: string, opts: TransformOpts = {}): string {
  const params = new URLSearchParams()
  if (opts.width) params.set('width', String(opts.width))
  if (opts.quality) params.set('quality', String(opts.quality))
  if (opts.format) params.set('format', opts.format)
  const qs = params.toString()
  return `${supabaseUrl}/storage/v1/render/image/public/public-photos/${path}${qs ? '?' + qs : ''}`
}
```

- [ ] **Step 6: Run tests, confirm pass**

```bash
pnpm --filter @ar/web test
```

Expected: 2 passing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib apps/web/tests
git commit -m "feat(web): supabase clients, env validation, photo URL helpers"
```

---

## Task A4: Layout, Header, Footer, Seo Component

**Files:**
- Create: `apps/web/src/layouts/Base.astro`
- Create: `apps/web/src/components/Header.astro`
- Create: `apps/web/src/components/Footer.astro`
- Create: `apps/web/src/components/Seo.astro`
- Modify: `apps/web/src/pages/index.astro`

- [ ] **Step 1: Seo component**

`apps/web/src/components/Seo.astro`:

```astro
---
interface Props {
  title: string
  description?: string
  canonical?: string
  image?: string
  jsonLd?: object
}
const { title, description, canonical, image, jsonLd } = Astro.props
const siteName = 'AR Management'
const fullTitle = title.includes(siteName) ? title : `${title} | ${siteName}`
const url = canonical ?? Astro.url.href
const ogImage = image ?? `${Astro.site}og-default.png`
---
<title>{fullTitle}</title>
{description && <meta name="description" content={description} />}
<link rel="canonical" href={url} />
<meta property="og:title" content={fullTitle} />
{description && <meta property="og:description" content={description} />}
<meta property="og:type" content="website" />
<meta property="og:url" content={url} />
<meta property="og:image" content={ogImage} />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={fullTitle} />
{description && <meta name="twitter:description" content={description} />}
<meta name="twitter:image" content={ogImage} />
{jsonLd && (
  <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
)}
```

- [ ] **Step 2: Header**

`apps/web/src/components/Header.astro`:

```astro
---
const links = [
  { href: '/', label: 'Home' },
  { href: '/listings', label: 'Listings' },
  { href: '/maintenance', label: 'Maintenance' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]
---
<header class="border-b border-gray-200 bg-white sticky top-0 z-10">
  <nav class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
    <a href="/" class="text-xl font-bold tracking-tight">AR Management</a>
    <ul class="hidden sm:flex gap-6 text-sm">
      {links.slice(1).map((l) => (
        <li><a href={l.href} class="text-gray-700 hover:text-[var(--color-brand)]">{l.label}</a></li>
      ))}
    </ul>
    <a href="/schedule" class="hidden sm:inline-flex bg-[var(--color-brand)] text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-[var(--color-brand-dark)]">Schedule a showing</a>
  </nav>
</header>
```

- [ ] **Step 3: Footer**

`apps/web/src/components/Footer.astro`:

```astro
---
const year = new Date().getFullYear()
---
<footer class="border-t border-gray-200 mt-16">
  <div class="max-w-5xl mx-auto px-4 py-8 grid sm:grid-cols-3 gap-6 text-sm">
    <div>
      <h3 class="font-semibold mb-2">AR Management</h3>
      <p class="text-gray-600">Apartment living at Grass Lake Manor and Winnetka Manor.</p>
    </div>
    <div>
      <h3 class="font-semibold mb-2">Get in touch</h3>
      <ul class="space-y-1 text-gray-700">
        <li><a href="/maintenance" class="hover:underline">Maintenance request</a></li>
        <li><a href="/schedule" class="hover:underline">Schedule a showing</a></li>
        <li><a href="/contact" class="hover:underline">Contact</a></li>
      </ul>
    </div>
    <div>
      <h3 class="font-semibold mb-2">Legal</h3>
      <ul class="space-y-1 text-gray-700">
        <li><a href="/privacy" class="hover:underline">Privacy</a></li>
        <li><a href="/terms" class="hover:underline">Terms</a></li>
      </ul>
    </div>
  </div>
  <div class="border-t border-gray-200 py-4 text-center text-xs text-gray-500">© {year} AR Management. All rights reserved.</div>
</footer>
```

- [ ] **Step 4: Base layout**

`apps/web/src/layouts/Base.astro`:

```astro
---
import '../styles/global.css'
import Header from '../components/Header.astro'
import Footer from '../components/Footer.astro'
import Seo from '../components/Seo.astro'
interface Props {
  title: string
  description?: string
  canonical?: string
  image?: string
  jsonLd?: object
}
const { title, description, canonical, image, jsonLd } = Astro.props
---
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <Seo {title} {description} {canonical} {image} {jsonLd} />
</head>
<body class="min-h-screen flex flex-col">
  <Header />
  <main class="flex-1"><slot /></main>
  <Footer />
</body>
</html>
```

- [ ] **Step 5: Replace index.astro to use Base + show buildings**

`apps/web/src/pages/index.astro`:

```astro
---
import Base from '../layouts/Base.astro'
import { supabase } from '../lib/supabase'
const { data: buildings = [] } = await supabase
  .from('buildings')
  .select('id, slug, name, address_line1, city, state')
  .eq('is_published', true)
  .order('name')
---
<Base
  title="Apartments at Grass Lake Manor and Winnetka Manor"
  description="Browse available apartments, schedule a showing, or submit a maintenance request at AR Management properties."
>
  <section class="max-w-5xl mx-auto px-4 py-12">
    <h1 class="text-4xl font-bold tracking-tight">Find your next home</h1>
    <p class="mt-3 text-gray-600 max-w-2xl">Quality apartment living at Grass Lake Manor and Winnetka Manor. Browse listings, schedule a tour, or report a maintenance issue.</p>
  </section>
  <section class="max-w-5xl mx-auto px-4 grid sm:grid-cols-2 gap-6 pb-12">
    {buildings.map((b) => (
      <a href={`/buildings/${b.slug}`} class="border border-gray-200 rounded-xl p-6 hover:border-[var(--color-brand)] transition">
        <h2 class="text-xl font-semibold">{b.name}</h2>
        <p class="text-gray-600 mt-1">{b.address_line1}, {b.city}, {b.state}</p>
        <p class="text-[var(--color-brand)] mt-3 font-medium">View units →</p>
      </a>
    ))}
  </section>
</Base>
```

- [ ] **Step 6: Build + smoke test**

```bash
pnpm --filter @ar/web dev &
sleep 5
curl -sS http://localhost:4321/ | grep -E "Grass Lake Manor|Winnetka Manor" && echo OK
pkill -f "astro dev"
```

Note: this requires `.env` to have valid `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` for a running Supabase project (local or remote). If not yet configured, `astro dev` will surface the env validation error from `lib/env.ts` — that's expected and acceptable until the user wires env.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): base layout, header, footer, seo component, home page wired to Supabase"
```

---

## Task A5: Building Detail, Listings, Unit Detail Pages

**Files:**
- Create: `apps/web/src/components/BuildingCard.astro`
- Create: `apps/web/src/components/UnitCard.astro`
- Create: `apps/web/src/components/PhotoGallery.astro`
- Create: `apps/web/src/components/AmenityList.astro`
- Create: `apps/web/src/pages/buildings/[slug].astro`
- Create: `apps/web/src/pages/listings.astro`
- Create: `apps/web/src/pages/units/[id].astro`

- [ ] **Step 1: PhotoGallery**

`apps/web/src/components/PhotoGallery.astro`:

```astro
---
import { transformedPhotoUrl } from '../lib/photo-url'
import { clientEnv } from '../lib/env'
interface Photo { storage_path: string; alt_text: string }
interface Props { photos: Photo[] }
const { photos } = Astro.props
---
{photos.length === 0 ? null : (
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
    {photos.map((p) => (
      <img
        src={transformedPhotoUrl(clientEnv.VITE_SUPABASE_URL, p.storage_path, { width: 800, quality: 75, format: 'webp' })}
        alt={p.alt_text}
        loading="lazy"
        class="rounded-lg object-cover w-full aspect-[4/3]"
      />
    ))}
  </div>
)}
```

- [ ] **Step 2: BuildingCard + UnitCard + AmenityList**

`apps/web/src/components/BuildingCard.astro`:

```astro
---
interface Props { b: { id: string; slug: string; name: string; address_line1: string; city: string; state: string } }
const { b } = Astro.props
---
<a href={`/buildings/${b.slug}`} class="block border border-gray-200 rounded-xl p-5 hover:border-[var(--color-brand)] transition">
  <h3 class="text-lg font-semibold">{b.name}</h3>
  <p class="text-gray-600 text-sm mt-1">{b.address_line1}, {b.city}, {b.state}</p>
</a>
```

`apps/web/src/components/UnitCard.astro`:

```astro
---
interface Props {
  u: {
    id: string
    unit_number: string
    bedrooms: number
    bathrooms: number
    sqft: number | null
    monthly_rent_cents: number
    available_from: string | null
    building?: { name: string; slug: string }
  }
}
const { u } = Astro.props
const beds = u.bedrooms === 0 ? 'Studio' : `${u.bedrooms} bd`
const rent = `$${(u.monthly_rent_cents / 100).toLocaleString()}`
---
<a href={`/units/${u.id}`} class="block border border-gray-200 rounded-xl p-5 hover:border-[var(--color-brand)] transition">
  <div class="flex items-baseline justify-between">
    <h3 class="text-lg font-semibold">Unit {u.unit_number}</h3>
    <span class="text-lg font-bold">{rent}<span class="text-sm font-normal text-gray-500">/mo</span></span>
  </div>
  {u.building && <p class="text-sm text-gray-500">{u.building.name}</p>}
  <p class="text-sm text-gray-700 mt-2">{beds} · {u.bathrooms} ba{u.sqft ? ` · ${u.sqft} sqft` : ''}</p>
  {u.available_from && <p class="text-xs text-gray-500 mt-2">Available {u.available_from}</p>}
</a>
```

`apps/web/src/components/AmenityList.astro`:

```astro
---
interface Props { amenities: string[] }
const { amenities } = Astro.props
---
{amenities.length === 0 ? null : (
  <ul class="flex flex-wrap gap-2">
    {amenities.map((a) => (
      <li class="px-3 py-1 text-sm bg-gray-100 rounded-full">{a}</li>
    ))}
  </ul>
)}
```

- [ ] **Step 3: Building detail page (SSG via getStaticPaths)**

`apps/web/src/pages/buildings/[slug].astro`:

```astro
---
import Base from '../../layouts/Base.astro'
import PhotoGallery from '../../components/PhotoGallery.astro'
import UnitCard from '../../components/UnitCard.astro'
import AmenityList from '../../components/AmenityList.astro'
import { supabase } from '../../lib/supabase'

export async function getStaticPaths() {
  const { data: buildings = [] } = await supabase
    .from('buildings')
    .select('slug')
    .eq('is_published', true)
  return buildings.map((b) => ({ params: { slug: b.slug } }))
}

const { slug } = Astro.params
const { data: building } = await supabase
  .from('buildings')
  .select('*, building_photos(storage_path, alt_text, sort_order)')
  .eq('slug', slug)
  .eq('is_published', true)
  .single()

if (!building) return Astro.redirect('/404')

const { data: units = [] } = await supabase
  .from('units')
  .select('id, unit_number, bedrooms, bathrooms, sqft, monthly_rent_cents, available_from')
  .eq('building_id', building.id)
  .in('status', ['available', 'coming_soon'])
  .order('monthly_rent_cents')

const photos = (building.building_photos ?? []).sort((a, b) => a.sort_order - b.sort_order)
---
<Base
  title={building.seo_title ?? `${building.name} — Apartments for Rent`}
  description={building.seo_description ?? building.description_md.slice(0, 160)}
>
  <section class="max-w-5xl mx-auto px-4 py-10">
    <h1 class="text-3xl sm:text-4xl font-bold">{building.name}</h1>
    <p class="text-gray-600 mt-1">{building.address_line1}, {building.city}, {building.state} {building.postal_code}</p>
  </section>

  {photos.length > 0 && (
    <section class="max-w-5xl mx-auto px-4 pb-8">
      <PhotoGallery photos={photos} />
    </section>
  )}

  <section class="max-w-5xl mx-auto px-4 py-6">
    <p class="prose">{building.description_md}</p>
  </section>

  <section class="max-w-5xl mx-auto px-4 py-8">
    <h2 class="text-2xl font-semibold mb-4">Available units</h2>
    {units.length === 0 ? (
      <p class="text-gray-600">No units currently available. <a href="/contact" class="text-[var(--color-brand)] underline">Contact us</a> to be notified.</p>
    ) : (
      <div class="grid sm:grid-cols-2 gap-4">
        {units.map((u) => <UnitCard u={u} />)}
      </div>
    )}
  </section>

  <section class="max-w-5xl mx-auto px-4 py-8">
    <h2 class="text-2xl font-semibold mb-4">Neighborhood</h2>
    <p class="prose">{building.neighborhood_md}</p>
  </section>

  <section class="max-w-5xl mx-auto px-4 py-8 pb-16">
    <h2 class="text-2xl font-semibold mb-4">Amenities</h2>
    <AmenityList amenities={building.amenities ?? []} />
  </section>
</Base>
```

- [ ] **Step 4: Listings page (SSR for query-param filters via prerender = false)**

`apps/web/src/pages/listings.astro`:

```astro
---
export const prerender = false
import Base from '../layouts/Base.astro'
import UnitCard from '../components/UnitCard.astro'
import { supabase } from '../lib/supabase'

const buildingFilter = Astro.url.searchParams.get('building') ?? null
const bedsFilter = Astro.url.searchParams.get('bedrooms')
const maxRent = Astro.url.searchParams.get('max_rent')

let q = supabase
  .from('units')
  .select('id, unit_number, bedrooms, bathrooms, sqft, monthly_rent_cents, available_from, building:buildings(name, slug, id)')
  .in('status', ['available', 'coming_soon'])
  .order('monthly_rent_cents')

if (buildingFilter) q = q.eq('buildings.slug', buildingFilter)
if (bedsFilter !== null && bedsFilter !== '') q = q.eq('bedrooms', Number(bedsFilter))
if (maxRent) q = q.lte('monthly_rent_cents', Number(maxRent) * 100)

const { data: units = [] } = await q

const { data: buildings = [] } = await supabase
  .from('buildings').select('id, slug, name').eq('is_published', true).order('name')
---
<Base title="Available apartments" description="Browse all available apartments at Grass Lake Manor and Winnetka Manor.">
  <section class="max-w-5xl mx-auto px-4 py-10">
    <h1 class="text-3xl font-bold">Available apartments</h1>
    <form method="get" class="flex flex-wrap gap-3 mt-4">
      <select name="building" class="border rounded px-3 py-1.5">
        <option value="">All buildings</option>
        {buildings.map((b) => (
          <option value={b.slug} selected={buildingFilter === b.slug}>{b.name}</option>
        ))}
      </select>
      <select name="bedrooms" class="border rounded px-3 py-1.5">
        <option value="">Any beds</option>
        <option value="0" selected={bedsFilter === '0'}>Studio</option>
        <option value="1" selected={bedsFilter === '1'}>1 bd</option>
        <option value="2" selected={bedsFilter === '2'}>2 bd</option>
        <option value="3" selected={bedsFilter === '3'}>3+ bd</option>
      </select>
      <input type="number" name="max_rent" placeholder="Max rent ($)" value={maxRent ?? ''} class="border rounded px-3 py-1.5 w-32" />
      <button type="submit" class="bg-[var(--color-brand)] text-white px-3 py-1.5 rounded">Filter</button>
      <a href="/listings" class="text-sm text-gray-500 self-center">Clear</a>
    </form>
  </section>
  <section class="max-w-5xl mx-auto px-4 pb-12">
    {units.length === 0 ? <p class="text-gray-600">No units match your filters.</p> : (
      <div class="grid sm:grid-cols-2 gap-4">{units.map((u) => <UnitCard u={u} />)}</div>
    )}
  </section>
</Base>
```

- [ ] **Step 5: Unit detail page (SSG via getStaticPaths)**

`apps/web/src/pages/units/[id].astro`:

```astro
---
import Base from '../../layouts/Base.astro'
import PhotoGallery from '../../components/PhotoGallery.astro'
import { supabase } from '../../lib/supabase'

export async function getStaticPaths() {
  const { data: units = [] } = await supabase
    .from('units')
    .select('id')
    .in('status', ['available', 'coming_soon'])
  return units.map((u) => ({ params: { id: u.id } }))
}

const { id } = Astro.params
const { data: unit } = await supabase
  .from('units')
  .select('*, unit_photos(storage_path, alt_text, sort_order), building:buildings(*)')
  .eq('id', id)
  .single()

if (!unit) return Astro.redirect('/404')

const beds = unit.bedrooms === 0 ? 'Studio' : `${unit.bedrooms} bedroom`
const rent = (unit.monthly_rent_cents / 100).toFixed(2)

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Apartment',
  name: `Unit ${unit.unit_number} at ${unit.building.name}`,
  address: {
    '@type': 'PostalAddress',
    streetAddress: unit.building.address_line1,
    addressLocality: unit.building.city,
    addressRegion: unit.building.state,
    postalCode: unit.building.postal_code,
    addressCountry: unit.building.country,
  },
  numberOfRooms: unit.bedrooms,
  numberOfBathroomsTotal: unit.bathrooms,
  ...(unit.sqft && { floorSize: { '@type': 'QuantitativeValue', value: unit.sqft, unitCode: 'FTK' } }),
  offers: {
    '@type': 'Offer',
    price: rent,
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    ...(unit.available_from && { availabilityStarts: unit.available_from }),
  },
}

const photos = (unit.unit_photos ?? []).sort((a, b) => a.sort_order - b.sort_order)
---
<Base
  title={`Unit ${unit.unit_number} at ${unit.building.name} — $${(unit.monthly_rent_cents/100).toLocaleString()}/mo`}
  description={`${beds} apartment${unit.sqft ? ', ' + unit.sqft + ' sqft' : ''} at ${unit.building.name}.`}
  jsonLd={jsonLd}
>
  <section class="max-w-5xl mx-auto px-4 py-10">
    <a href={`/buildings/${unit.building.slug}`} class="text-sm text-[var(--color-brand)] hover:underline">← Back to {unit.building.name}</a>
    <h1 class="text-3xl font-bold mt-2">Unit {unit.unit_number}</h1>
    <p class="text-gray-600">{unit.building.name}</p>
  </section>

  {photos.length > 0 && (
    <section class="max-w-5xl mx-auto px-4 pb-6">
      <PhotoGallery photos={photos} />
    </section>
  )}

  <section class="max-w-5xl mx-auto px-4 py-6 flex flex-wrap gap-6 items-baseline">
    <span class="text-3xl font-bold">${(unit.monthly_rent_cents / 100).toLocaleString()}<span class="text-base font-normal text-gray-500">/mo</span></span>
    <span class="text-gray-700">{beds} · {unit.bathrooms} ba{unit.sqft ? ` · ${unit.sqft} sqft` : ''}</span>
    {unit.available_from && <span class="text-gray-500">Available from {unit.available_from}</span>}
  </section>

  <section class="max-w-5xl mx-auto px-4 py-6">
    <p class="prose">{unit.description_md}</p>
  </section>

  <section class="max-w-5xl mx-auto px-4 py-6 pb-16">
    <a href={`/schedule?unit=${unit.id}`} class="inline-block bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)]">Schedule a showing</a>
  </section>
</Base>
```

- [ ] **Step 6: Build + verify**

```bash
pnpm --filter @ar/web build
```

Expected: build succeeds; `dist/` has `buildings/grass-lake-manor/index.html`, `units/<id>/index.html` (one per available unit), `listings/index.html` (SSR fallback or empty placeholder for the prerendered route — listings is `prerender = false` so it's a Vercel function instead).

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): building detail, listings, unit detail pages with SEO + JSON-LD"
```

---

## Task A6: Static Pages (About, Contact, Privacy, Terms)

**Files:**
- Create: `apps/web/src/pages/about.astro`
- Create: `apps/web/src/pages/contact.astro`
- Create: `apps/web/src/pages/privacy.astro`
- Create: `apps/web/src/pages/terms.astro`

- [ ] **Step 1: about.astro**

```astro
---
import Base from '../layouts/Base.astro'
---
<Base title="About AR Management" description="About AR Management — owners and operators of Grass Lake Manor and Winnetka Manor.">
  <section class="max-w-3xl mx-auto px-4 py-12">
    <h1 class="text-3xl font-bold">About AR Management</h1>
    <p class="mt-4 text-gray-700">AR Management owns and operates Grass Lake Manor and Winnetka Manor apartments. We focus on responsive maintenance, transparent pricing, and a respectful resident experience.</p>
  </section>
</Base>
```

- [ ] **Step 2: contact.astro**

```astro
---
import Base from '../layouts/Base.astro'
import { supabase } from '../lib/supabase'
const { data: buildings = [] } = await supabase.from('buildings').select('id, name, address_line1, address_line2, city, state, postal_code, contact_phone, contact_email').eq('is_published', true).order('name')
---
<Base title="Contact AR Management" description="Get in touch with AR Management.">
  <section class="max-w-3xl mx-auto px-4 py-12">
    <h1 class="text-3xl font-bold">Contact</h1>
    <div class="mt-6 grid sm:grid-cols-2 gap-6">
      {buildings.map((b) => (
        <div class="border border-gray-200 rounded-xl p-5">
          <h2 class="font-semibold text-lg">{b.name}</h2>
          <p class="text-sm text-gray-700 mt-1">{b.address_line1}{b.address_line2 ? `, ${b.address_line2}` : ''}<br />{b.city}, {b.state} {b.postal_code}</p>
          {b.contact_phone && <p class="text-sm mt-2"><span class="text-gray-500">Phone:</span> <a href={`tel:${b.contact_phone}`} class="text-[var(--color-brand)] hover:underline">{b.contact_phone}</a></p>}
          {b.contact_email && <p class="text-sm"><span class="text-gray-500">Email:</span> <a href={`mailto:${b.contact_email}`} class="text-[var(--color-brand)] hover:underline">{b.contact_email}</a></p>}
        </div>
      ))}
    </div>
  </section>
</Base>
```

- [ ] **Step 3: privacy.astro**

```astro
---
import Base from '../layouts/Base.astro'
---
<Base title="Privacy Policy">
  <section class="max-w-3xl mx-auto px-4 py-12 prose">
    <h1>Privacy Policy</h1>
    <p>We collect only the information you provide via our forms (name, contact information, request details, photos). We use this information solely to respond to your request and operate our properties. We do not sell personal information.</p>
    <p>Email <a href="mailto:privacy@ar-management.example">privacy@ar-management.example</a> with questions or to request deletion of your data.</p>
  </section>
</Base>
```

- [ ] **Step 4: terms.astro**

```astro
---
import Base from '../layouts/Base.astro'
---
<Base title="Terms of Use">
  <section class="max-w-3xl mx-auto px-4 py-12 prose">
    <h1>Terms of Use</h1>
    <p>Use of this site is provided on an as-is basis. Submitting a maintenance or showing request does not create a tenancy or a contract. AR Management may update these terms from time to time.</p>
  </section>
</Base>
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages
git commit -m "feat(web): about, contact, privacy, terms static pages"
```

---

## Task A7: Maintenance Request Form (React Island)

**Files:**
- Create: `apps/web/src/components/islands/TurnstileWidget.tsx`
- Create: `apps/web/src/components/islands/PhotoUploader.tsx`
- Create: `apps/web/src/components/islands/MaintenanceForm.tsx`
- Create: `apps/web/src/pages/maintenance.astro`

- [ ] **Step 1: TurnstileWidget**

`apps/web/src/components/islands/TurnstileWidget.tsx`:

```tsx
import { useEffect, useRef } from 'react'

declare global { interface Window { turnstile?: any } }

interface Props { siteKey: string; onToken: (t: string) => void }

export function TurnstileWidget({ siteKey, onToken }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!document.querySelector('script[data-turnstile]')) {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      s.async = true; s.defer = true
      s.setAttribute('data-turnstile', '1')
      document.head.appendChild(s)
    }
    const id = setInterval(() => {
      if (window.turnstile && ref.current && !ref.current.hasChildNodes()) {
        clearInterval(id)
        window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken })
      }
    }, 100)
    return () => clearInterval(id)
  }, [siteKey, onToken])
  return <div ref={ref} className="my-3" />
}
```

- [ ] **Step 2: PhotoUploader**

`apps/web/src/components/islands/PhotoUploader.tsx`:

```tsx
import { useState } from 'react'

interface UploadResp {
  temp_id: string
  uploads: { path: string; signedUrl: string; token: string }[]
}

interface Props {
  supabaseUrl: string
  anonKey: string
  turnstileToken: string | null
  onPathsChange: (paths: string[]) => void
}

export function PhotoUploader({ supabaseUrl, anonKey, turnstileToken, onPathsChange }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [paths, setPaths] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).slice(0, 5)
    const oversize = picked.find((f) => f.size > 10 * 1024 * 1024)
    if (oversize) { setError(`${oversize.name} exceeds 10 MB limit`); return }
    setError(null)
    setFiles(picked)
  }

  async function handleUpload() {
    if (!turnstileToken) { setError('Please complete the captcha first'); return }
    if (files.length === 0) return
    setUploading(true); setError(null)
    try {
      const ct = files[0]!.type
      const r = await fetch(`${supabaseUrl}/functions/v1/request-upload-urls`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ count: files.length, content_type: ct, turnstile_token: turnstileToken }),
      })
      if (!r.ok) throw new Error(`server: ${await r.text()}`)
      const data = (await r.json()) as UploadResp
      for (let i = 0; i < files.length; i++) {
        const u = data.uploads[i]!
        const put = await fetch(u.signedUrl, { method: 'PUT', body: files[i]!, headers: { 'content-type': files[i]!.type, 'x-upsert': 'false' } })
        if (!put.ok) throw new Error(`upload ${i + 1} failed`)
      }
      const finalPaths = data.uploads.map((u) => u.path)
      setPaths(finalPaths); onPathsChange(finalPaths)
    } catch (e) { setError((e as Error).message) }
    finally { setUploading(false) }
  }

  return (
    <div>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePick} className="block text-sm" />
      <p className="text-xs text-gray-500 mt-1">Up to 5 photos, JPEG/PNG/WebP, 10 MB each.</p>
      {files.length > 0 && paths.length === 0 && (
        <button type="button" onClick={handleUpload} disabled={uploading || !turnstileToken}
                className="mt-2 px-3 py-1.5 bg-[var(--color-brand)] text-white rounded text-sm disabled:bg-gray-400">
          {uploading ? 'Uploading…' : `Upload ${files.length} photo${files.length === 1 ? '' : 's'}`}
        </button>
      )}
      {paths.length > 0 && <p className="text-sm text-green-700 mt-2">{paths.length} photo{paths.length === 1 ? '' : 's'} uploaded</p>}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: MaintenanceForm**

`apps/web/src/components/islands/MaintenanceForm.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MaintenanceRequestInputSchema, type MaintenanceRequestInput } from '@ar/shared'
import { createClient } from '@supabase/supabase-js'
import { TurnstileWidget } from './TurnstileWidget'
import { PhotoUploader } from './PhotoUploader'

interface Props {
  supabaseUrl: string
  anonKey: string
  turnstileSiteKey: string
  buildings: { id: string; name: string }[]
}

export function MaintenanceForm({ supabaseUrl, anonKey, turnstileSiteKey, buildings }: Props) {
  const supabase = createClient(supabaseUrl, anonKey)
  const [turnstile, setTurnstile] = useState<string | null>(null)
  const [photoPaths, setPhotoPaths] = useState<string[]>([])
  const [submitted, setSubmitted] = useState<{ ref_id: string } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, watch } = useForm<MaintenanceRequestInput>({
    resolver: zodResolver(MaintenanceRequestInputSchema),
    defaultValues: { source: 'web', photo_paths: [], turnstile_token: '' },
  })

  useEffect(() => { setValue('photo_paths', photoPaths) }, [photoPaths, setValue])
  useEffect(() => { if (turnstile) setValue('turnstile_token', turnstile) }, [turnstile, setValue])

  const buildingId = watch('building_id')
  const urgency = watch('urgency')

  async function onSubmit(values: MaintenanceRequestInput) {
    setSubmitError(null)
    const { turnstile_token, ...payload } = values
    const { data, error } = await supabase.from('maintenance_requests').insert(payload).select('ref_id').single()
    if (error) { setSubmitError(error.message); return }
    setSubmitted({ ref_id: data!.ref_id })
  }

  if (submitted) {
    return (
      <div className="border border-green-300 bg-green-50 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-green-900">Request received</h2>
        <p className="mt-2 text-green-900">Reference: <strong>{submitted.ref_id}</strong>. A property manager will follow up within one business day.</p>
      </div>
    )
  }

  const inputCls = 'block w-full border border-gray-300 rounded px-3 py-2'
  const labelCls = 'block text-sm font-medium mt-4 mb-1'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
      <label className={labelCls}>Building</label>
      <div className="flex flex-wrap gap-2">
        {buildings.map((b) => (
          <button key={b.id} type="button" onClick={() => setValue('building_id', b.id, { shouldValidate: true })}
                  className={`px-3 py-1.5 rounded border ${buildingId === b.id ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300'}`}>
            {b.name}
          </button>
        ))}
      </div>
      {errors.building_id && <p className="text-sm text-red-600">Pick a building</p>}

      <label className={labelCls}>Unit number</label>
      <input {...register('unit_number')} placeholder="e.g. 3B" className={inputCls} />
      {errors.unit_number && <p className="text-sm text-red-600">{errors.unit_number.message}</p>}

      <label className={labelCls}>Your name</label>
      <input {...register('tenant_name')} className={inputCls} />
      {errors.tenant_name && <p className="text-sm text-red-600">{errors.tenant_name.message}</p>}

      <label className={labelCls}>Email</label>
      <input {...register('tenant_email')} type="email" className={inputCls} />
      <label className={labelCls}>Phone (optional if email provided)</label>
      <input {...register('tenant_phone')} type="tel" className={inputCls} />

      <label className={labelCls}>Issue type</label>
      <select {...register('issue_type')} className={inputCls}>
        <option value="">Select…</option>
        <option value="plumbing">Plumbing</option>
        <option value="electrical">Electrical</option>
        <option value="hvac">HVAC / heating / cooling</option>
        <option value="appliance">Appliance</option>
        <option value="pest">Pest</option>
        <option value="locks">Locks / keys</option>
        <option value="other">Other</option>
      </select>

      <label className={labelCls}>Urgency</label>
      <div className="flex flex-wrap gap-2">
        {(['low','normal','high','emergency'] as const).map((u) => (
          <button key={u} type="button" onClick={() => setValue('urgency', u, { shouldValidate: true })}
                  className={`px-3 py-1.5 rounded border capitalize ${urgency === u ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300'}`}>
            {u}
          </button>
        ))}
      </div>

      <label className={labelCls}>Description</label>
      <textarea {...register('description')} rows={4} className={inputCls} />
      {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}

      <label className={labelCls}>Photos (optional, up to 5)</label>
      <PhotoUploader supabaseUrl={supabaseUrl} anonKey={anonKey} turnstileToken={turnstile} onPathsChange={setPhotoPaths} />

      <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstile} />

      {submitError && <p className="text-red-600 text-sm">{submitError}</p>}

      <button type="submit" disabled={isSubmitting} className="mt-4 inline-flex items-center bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400">
        {isSubmitting ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: maintenance.astro**

```astro
---
import Base from '../layouts/Base.astro'
import { MaintenanceForm } from '../components/islands/MaintenanceForm'
import { supabase } from '../lib/supabase'
import { clientEnv } from '../lib/env'

const { data: buildings = [] } = await supabase
  .from('buildings').select('id, name').eq('is_published', true).order('name')
---
<Base title="Submit a maintenance request" description="Tell us about a maintenance issue at your AR Management apartment.">
  <section class="max-w-2xl mx-auto px-4 py-10">
    <h1 class="text-3xl font-bold">Maintenance request</h1>
    <p class="mt-2 text-gray-600">Existing residents — let us know what needs attention.</p>
    <div class="mt-6">
      <MaintenanceForm
        client:load
        supabaseUrl={clientEnv.VITE_SUPABASE_URL}
        anonKey={clientEnv.VITE_SUPABASE_ANON_KEY}
        turnstileSiteKey={clientEnv.VITE_TURNSTILE_SITE_KEY}
        buildings={buildings}
      />
    </div>
  </section>
</Base>
```

- [ ] **Step 5: Build + smoke test**

```bash
pnpm --filter @ar/web build
```

Expected: build succeeds. Visit `/maintenance` in dev — the React form should mount with two building chips.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): maintenance request form with photo upload and Turnstile"
```

---

## Task A8: Schedule-a-Showing Form (React Island)

**Files:**
- Create: `apps/web/src/components/islands/ShowingForm.tsx`
- Create: `apps/web/src/pages/schedule.astro`

- [ ] **Step 1: ShowingForm**

`apps/web/src/components/islands/ShowingForm.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShowingRequestInputSchema, type ShowingRequestInput } from '@ar/shared'
import { createClient } from '@supabase/supabase-js'
import { TurnstileWidget } from './TurnstileWidget'

interface Slot { id: string; starts_at: string; ends_at: string }

interface Props {
  supabaseUrl: string
  anonKey: string
  turnstileSiteKey: string
  buildings: { id: string; name: string }[]
  initialUnitId: string | null
  initialBuildingId: string | null
}

export function ShowingForm({ supabaseUrl, anonKey, turnstileSiteKey, buildings, initialUnitId, initialBuildingId }: Props) {
  const supabase = createClient(supabaseUrl, anonKey)
  const [buildingId, setBuildingId] = useState<string | null>(initialBuildingId)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotId, setSlotId] = useState<string | null>(null)
  const [d1, setD1] = useState(''); const [d2, setD2] = useState(''); const [d3, setD3] = useState('')
  const [turnstile, setTurnstile] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ ref_id: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, setValue, formState: { isSubmitting } } = useForm<ShowingRequestInput>({
    resolver: zodResolver(ShowingRequestInputSchema),
    defaultValues: {
      source: 'web',
      building_id: initialBuildingId ?? '',
      unit_id: initialUnitId,
      slot_id: null,
      preferred_dates: null,
      turnstile_token: '',
    },
  })

  useEffect(() => {
    if (!buildingId) { setSlots([]); return }
    supabase.from('availability_slots').select('id, starts_at, ends_at')
      .eq('building_id', buildingId).eq('status', 'open').gt('starts_at', new Date().toISOString())
      .order('starts_at').then(({ data }) => setSlots(data ?? []))
  }, [buildingId])

  useEffect(() => { if (turnstile) setValue('turnstile_token', turnstile) }, [turnstile, setValue])

  async function onSubmit(values: ShowingRequestInput) {
    setError(null)
    const dates = [d1, d2, d3].filter(Boolean)
    const { turnstile_token, ...payload } = values
    const finalPayload = {
      ...payload,
      building_id: buildingId!,
      unit_id: initialUnitId,
      slot_id: slotId,
      preferred_dates: slotId ? null : dates,
    }
    const { data, error: err } = await supabase.from('showing_requests').insert(finalPayload).select('ref_id').single()
    if (err) { setError(err.message); return }
    setSubmitted({ ref_id: data!.ref_id })
  }

  if (submitted) {
    return (
      <div className="border border-green-300 bg-green-50 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-green-900">Showing request received</h2>
        <p className="mt-2 text-green-900">Reference: <strong>{submitted.ref_id}</strong>. We'll confirm a time within one business day.</p>
      </div>
    )
  }

  const inputCls = 'block w-full border border-gray-300 rounded px-3 py-2'
  const labelCls = 'block text-sm font-medium mt-4 mb-1'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
      <label className={labelCls}>Building</label>
      <div className="flex flex-wrap gap-2">
        {buildings.map((b) => (
          <button key={b.id} type="button" onClick={() => { setBuildingId(b.id); setValue('building_id', b.id) }}
                  className={`px-3 py-1.5 rounded border ${buildingId === b.id ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300'}`}>
            {b.name}
          </button>
        ))}
      </div>

      <label className={labelCls}>Pick a slot</label>
      {slots.length === 0 ? (
        <p className="text-sm text-gray-500">No published slots — propose preferred dates below.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => {
            const t = new Date(s.starts_at)
            const label = t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            const active = slotId === s.id
            return (
              <button key={s.id} type="button"
                      onClick={() => { setSlotId(s.id); setValue('slot_id', s.id); setValue('preferred_dates', null) }}
                      className={`px-3 py-1.5 rounded border ${active ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]' : 'border-gray-300'}`}>
                {label}
              </button>
            )
          })}
        </div>
      )}

      <label className={labelCls}>…or propose up to 3 preferred dates</label>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={d1} onChange={(e) => setD1(e.target.value)} className={inputCls + ' max-w-[160px]'} />
        <input type="date" value={d2} onChange={(e) => setD2(e.target.value)} className={inputCls + ' max-w-[160px]'} />
        <input type="date" value={d3} onChange={(e) => setD3(e.target.value)} className={inputCls + ' max-w-[160px]'} />
      </div>

      <label className={labelCls}>Your name</label>
      <input {...register('prospect_name')} className={inputCls} />

      <label className={labelCls}>Email</label>
      <input {...register('prospect_email')} type="email" className={inputCls} />

      <label className={labelCls}>Phone (optional)</label>
      <input {...register('prospect_phone')} type="tel" className={inputCls} />

      <label className={labelCls}>Message (optional)</label>
      <textarea {...register('message')} rows={3} className={inputCls} />

      <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstile} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={isSubmitting} className="mt-4 inline-flex items-center bg-[var(--color-brand)] text-white px-5 py-2.5 rounded font-medium hover:bg-[var(--color-brand-dark)] disabled:bg-gray-400">
        {isSubmitting ? 'Submitting…' : 'Request showing'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: schedule.astro**

```astro
---
export const prerender = false
import Base from '../layouts/Base.astro'
import { ShowingForm } from '../components/islands/ShowingForm'
import { supabase } from '../lib/supabase'
import { clientEnv } from '../lib/env'

const unitId = Astro.url.searchParams.get('unit')
const { data: buildings = [] } = await supabase.from('buildings').select('id, name').eq('is_published', true).order('name')

let initialBuildingId: string | null = null
if (unitId) {
  const { data: u } = await supabase.from('units').select('building_id').eq('id', unitId).maybeSingle()
  initialBuildingId = u?.building_id ?? null
}
---
<Base title="Schedule a showing" description="Pick a tour time at Grass Lake Manor or Winnetka Manor.">
  <section class="max-w-2xl mx-auto px-4 py-10">
    <h1 class="text-3xl font-bold">Schedule a showing</h1>
    <p class="mt-2 text-gray-600">Tell us when you'd like to see the apartment.</p>
    <div class="mt-6">
      <ShowingForm
        client:load
        supabaseUrl={clientEnv.VITE_SUPABASE_URL}
        anonKey={clientEnv.VITE_SUPABASE_ANON_KEY}
        turnstileSiteKey={clientEnv.VITE_TURNSTILE_SITE_KEY}
        buildings={buildings}
        initialUnitId={unitId}
        initialBuildingId={initialBuildingId}
      />
    </div>
  </section>
</Base>
```

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @ar/web build
git add apps/web
git commit -m "feat(web): schedule-a-showing form with slot picker + preferred dates"
```

---

## Task A9: robots.txt + Health API + Vercel Config

**Files:**
- Create: `apps/web/src/pages/robots.txt.ts`
- Create: `apps/web/src/pages/api/health.ts`
- Create: `apps/web/public/favicon.svg`
- Create: `apps/web/vercel.json` (only if extra config needed beyond adapter defaults)

- [ ] **Step 1: robots.txt**

`apps/web/src/pages/robots.txt.ts`:

```ts
import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  const isPreview = process.env.VERCEL_ENV === 'preview'
  const body = isPreview
    ? `User-agent: *\nDisallow: /\n`
    : `User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap-index.xml\n`
  return new Response(body, { headers: { 'content-type': 'text/plain' } })
}
```

- [ ] **Step 2: health endpoint**

`apps/web/src/pages/api/health.ts`:

```ts
export const prerender = false
import type { APIRoute } from 'astro'
import { supabase } from '../../lib/supabase'

export const GET: APIRoute = async () => {
  try {
    const { error } = await supabase.from('buildings').select('id').limit(1)
    if (error) throw error
    return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 503, headers: { 'content-type': 'application/json' },
    })
  }
}
```

- [ ] **Step 3: favicon**

`apps/web/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0a58ca"/><text x="16" y="22" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">AR</text></svg>
```

- [ ] **Step 4: Build + commit**

```bash
pnpm --filter @ar/web build
git add apps/web
git commit -m "feat(web): robots.txt, /api/health, favicon"
```

---

## Task A10: Tests — Vitest Units + Playwright E2E + a11y

**Files:**
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/tests/e2e/browse.spec.ts`
- Create: `apps/web/tests/e2e/submit-maintenance.spec.ts`
- Create: `apps/web/tests/e2e/submit-showing.spec.ts`
- Create: `apps/web/tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Vitest config**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
})
```

- [ ] **Step 2: Playwright config**

```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4321' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'pnpm dev',
    url: 'http://localhost:4321',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
})
```

- [ ] **Step 3: browse.spec.ts**

```ts
import { test, expect } from '@playwright/test'

test('home shows both buildings', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Grass Lake Manor/i)).toBeVisible()
  await expect(page.getByText(/Winnetka Manor/i)).toBeVisible()
})

test('listings page loads without error', async ({ page }) => {
  await page.goto('/listings')
  await expect(page.getByRole('heading', { name: /Available apartments/i })).toBeVisible()
})

test('building detail loads', async ({ page }) => {
  await page.goto('/buildings/grass-lake-manor')
  await expect(page.getByRole('heading', { name: /Grass Lake Manor/i })).toBeVisible()
})
```

- [ ] **Step 4: submit-maintenance.spec.ts**

```ts
import { test, expect } from '@playwright/test'

test('maintenance form renders and validates', async ({ page }) => {
  await page.goto('/maintenance')
  await expect(page.getByRole('heading', { name: /Maintenance request/i })).toBeVisible()
  await page.getByText(/Grass Lake Manor/i).first().click()
  await page.getByLabel(/Unit number/i).fill('3B')
  await page.getByLabel(/Your name/i).fill('E2E Tester')
  await page.getByLabel(/Email/i).fill('e2e@example.com')
  await page.getByLabel(/Issue type/i).selectOption('plumbing')
  await page.getByText(/^normal$/i).click()
  await page.getByLabel(/Description/i).fill('Sink leaking under cabinet — end-to-end test.')
  // Skip captcha + actual submit unless TURNSTILE_BYPASS env is set
  if (process.env.E2E_SUBMIT === 'true') {
    await page.getByRole('button', { name: /Submit request/i }).click()
    await expect(page.getByText(/Request received/i)).toBeVisible({ timeout: 15_000 })
  }
})
```

- [ ] **Step 5: submit-showing.spec.ts**

```ts
import { test, expect } from '@playwright/test'

test('showing form renders and accepts a preferred date', async ({ page }) => {
  await page.goto('/schedule')
  await expect(page.getByRole('heading', { name: /Schedule a showing/i })).toBeVisible()
  await page.getByText(/Grass Lake Manor/i).first().click()
  const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  await page.locator('input[type="date"]').first().fill(future)
  await page.getByLabel(/Your name/i).fill('Prospect Tester')
  await page.getByLabel(/Email/i).fill('prospect@example.com')
  if (process.env.E2E_SUBMIT === 'true') {
    await page.getByRole('button', { name: /Request showing/i }).click()
    await expect(page.getByText(/Showing request received/i)).toBeVisible({ timeout: 15_000 })
  }
})
```

- [ ] **Step 6: a11y.spec.ts**

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

- [ ] **Step 7: Run + commit**

```bash
pnpm --filter @ar/web exec playwright install --with-deps chromium webkit
pnpm --filter @ar/web test
git add apps/web
git commit -m "test(web): vitest + playwright + axe-playwright golden paths"
```

---

## Task A11: CI + Deploy Workflow Updates

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy-web.yml` (verify Astro build invocation)

- [ ] **Step 1: Update ci.yml**

Replace the e2e block (currently commented out) with a working Astro version:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: lint-typecheck-test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @ar/web exec playwright install --with-deps chromium webkit
      - run: pnpm --filter @ar/web build
      - name: Run E2E
        run: pnpm --filter @ar/web test:e2e
        env:
          PUBLIC_SUPABASE_URL: ${{ secrets.E2E_SUPABASE_URL }}
          PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.E2E_SUPABASE_ANON_KEY }}
          PUBLIC_TURNSTILE_SITE_KEY: 1x00000000000000000000AA
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/web/playwright-report/
```

- [ ] **Step 2: Verify deploy-web.yml is still correct**

(No change required — Vercel auto-deploys on push to main via its GitHub integration. The Supabase migration job in deploy-web.yml is unchanged.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enable E2E job for the Astro web app"
```

---

## Task A12: Update Runbooks

**Files:**
- Modify: `docs/superpowers/runbooks/launch.md` (Vercel project root → `apps/web`, Astro build)
- Modify: `docs/superpowers/runbooks/pre-launch.md` (replace Lynx-specific items with Astro-specific)
- Add: short note in repo root `README.md` pointing to the new spec + plan

- [ ] **Step 1: launch.md changes**

Edit `docs/superpowers/runbooks/launch.md` step 1: change "Project root: `apps/lynx`" → "Project root: `apps/web`. Framework preset: Astro." Step 2: add `PUBLIC_` prefix to env var names (Astro convention).

- [ ] **Step 2: pre-launch.md changes**

Replace the **Mobile** section's contents with a one-liner: "Mobile app deferred to Sub-project #1.5 (`apps/lynx/` is parked)." Keep all other sections.

- [ ] **Step 3: Update README**

Append a "Current state" paragraph noting: Lynx parked, Astro web app at `apps/web/`, see `docs/superpowers/specs/2026-05-04-astro-web-spec.md`.

- [ ] **Step 4: Commit**

```bash
git add docs README.md
git commit -m "docs: update runbooks + README for Astro pivot"
```

---

## Self-Review

**1. Spec coverage check:**

| Spec section | Plan task(s) |
|---|---|
| Architecture | A1, A2, A3 |
| Routing | A4 (home), A5 (building/listings/unit), A6 (static), A7 (maintenance), A8 (schedule) |
| Components | A4 (header/footer/seo), A5 (cards/gallery/amenity), A7 + A8 (form islands) |
| Data flow | A3 (clients), A5 (read paths), A7 + A8 (form inserts) |
| SEO | A2 (sitemap integration), A4 (Seo component), A5 (JSON-LD), A9 (robots) |
| Performance | Inherited from Astro defaults; verified in Lighthouse during pre-launch |
| Tests | A10 |
| CI | A11 |
| Runbooks | A12 |

No spec section without a task.

**2. Placeholder scan:** All `__PLACEHOLDER__` markers are pre-existing user-input gates (`OPEN-1`–`OPEN-5`) tracked in the pre-launch checklist. No `TODO` / `TBD` in plan steps.

**3. Type / name consistency:**
- `MaintenanceRequestInput`, `ShowingRequestInput`: from `@ar/shared`, used in A7 + A8.
- `clientEnv` defined in A3, used in A4, A5, A7, A8.
- `supabase` (anon client) defined in A3, used everywhere.
- `Building`, `Unit` types: imported from `@ar/shared` where needed (the components inline narrower interfaces for prop ergonomics — acceptable).
- `publicPhotoUrl`, `transformedPhotoUrl`: A3, used in A5 PhotoGallery.
- React island names match between component files and `client:load` invocations.

No issues found.

---

**End of plan.**
