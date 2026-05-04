# Lynx Spike — Findings (2026-05-03)

**Environment:** Linux (no iOS Simulator, no Android Emulator, no Docker available locally). Spike can only validate web-side and build-output behavior.

**Tooling versions installed by `create-rspeedy@0.14.3`:**
- `@lynx-js/react` 0.120.0
- `@lynx-js/rspeedy` 0.14.3
- `@lynx-js/react-rsbuild-plugin` 0.16.1
- `@lynx-js/types` 3.7.0
- `vitest` 3.2.4

## What was validated

| Check | Result |
|---|---|
| `npm create rspeedy@latest` scaffolds non-interactively with `--template react-ts --tools vitest-rltl,eslint --packageName @ar/lynx` | ✅ |
| `pnpm install` succeeds (1 unrelated peer dep warning) | ✅ |
| `pnpm --filter @ar/lynx dev` starts the dev server on port 3000 | ✅ |
| `pnpm --filter @ar/lynx build` produces `dist/main.lynx.bundle` (78.7 KB) | ✅ |

## What FAILED — the critical finding

**`rspeedy 0.14` does not produce a web build.** The `dist/` directory after `pnpm build` contains only:

```
dist/main.lynx.bundle               78.7 kB    ← Lynx-format bundle for native runtime
dist/static/image/*.png             ~150 kB total
```

There is **no `index.html`**. There is **no browser-renderable bundle**. `curl http://localhost:3000/` returns **HTTP 404** because the dev server only serves the Lynx bundle URL (`/main.lynx.bundle`) for consumption by Lynx Explorer / a Lynx-runtime app. The dev server is a build-time bridge for native devices, not a web host.

**This means a Lynx app, with the default rspeedy template, is mobile-only (iOS + Android via Lynx Explorer).** Web is not a target.

The Lynx team has an experimental `lynx-family/web` runtime, but it is not wired into the default rspeedy template, is not documented as production-ready, and would still be a JS-rendered SPA (not SSR/SSG, so no real SEO).

## What was NOT validated (requires user-side hardware)

- **iOS Simulator + Lynx Explorer iOS**: requires Mac + Xcode. Not testable from this Linux env.
- **Android Emulator + Lynx Explorer Android**: requires Android Studio. Not testable here.
- **Supabase fetch from inside the Lynx runtime**: requires a Lynx Explorer or compiled native app to verify. Pure JavaScript/`fetch`/`@supabase/supabase-js` are pure-JS libs and *should* work in the Lynx JS runtime, but the spike couldn't actually exercise this.
- **Camera / photo picker in Lynx**: a Lynx-native module is required for camera/library access on iOS/Android. The default scaffold does not include one. Confirmation deferred.

## Decision

**HALT on the original "single Lynx codebase to iOS + Android + Web" approach.**

The user explicitly chose Approach B in brainstorming ("iOS + Android + Web in one Lynx codebase, accepting the SEO trade-off"). The spike confirms the trade-off is harder than expected: there is **no Web target at all** in the default rspeedy build. Not just "no SSR" — there is no browser bundle, period.

For two apartment buildings whose primary leasing funnel is prospects Googling "Winnetka apartments" / "Grass Lake Manor", a mobile-only app that's discoverable only through the App Store / Play Store is not a viable replacement for a website.

## Recommended pivot

**Option A (recommended): Lynx mobile + a separate small web app.**
- Keep the scaffolded `apps/lynx/` for iOS + Android (resident maintenance app + leasing tour-scheduling for power users).
- Add a new `apps/web/` using **Astro** (or Next.js) for the marketing site. Astro is the most efficient choice for a 2-building marketing/listings site: ships zero JS by default, perfect Lighthouse scores, minimal hosting cost. SEO is first-class.
- Both apps share `@ar/shared` (Zod schemas, types) and the `supabase/` backend (which is already built).
- Web app implements: home, building pages, listings, schedule-a-showing, maintenance request, about, contact, privacy, terms, sitemap, robots, JSON-LD.
- Mobile app implements: same forms (or a subset) + future tenant features.

**Option B: All-web, no Lynx mobile (yet).**
- Drop Lynx for now. Build only `apps/web/` with Astro or Next.js.
- Add a mobile app later when two-building scale justifies it.
- Fastest path to production; honest about what two buildings actually need.

**Option C: Stay all-Lynx, accept no SEO.**
- Skip the website entirely. Mobile apps only.
- Strongly discouraged for a leasing funnel.

## Recommendation to user

Pick **Option A** if mobile presence matters now, **Option B** if it doesn't. Either way, the foundation already built (database, Edge Functions, shared schemas, runbooks) is fully reusable.
