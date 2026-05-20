# ADR-0001: Replace Lynx with Astro for the public site

- **Date:** 2026-05-04
- **Status:** Accepted (formalizing a decision already implemented; this ADR was added 2026-05-20 as part of the superpower-plan doc cleanup)
- **Deciders:** Hossein Feiz

## Context

The original `apps/lynx/` was scaffolded as a Lynx (`@lynx-js/react` + `rspeedy`) project on the assumption that Lynx would compile to iOS, Android, **and web** from a single TypeScript codebase. The spike at `docs/superpowers/spike/SPIKE-NOTES.md` validated that assumption end-to-end and found the critical gap:

> `rspeedy 0.14` does not produce a web build. The dist contains only `main.lynx.bundle` (consumed by Lynx Explorer / native runtime). `curl http://localhost:3000/` returns 404.

The product needs a public, indexable, SEO-friendly website for two physical buildings (Grass Lake Manor + Winnetka Manor). Local SEO is the dominant traffic acquisition channel. A JS-rendered SPA without SSR/SSG is not viable for that use case.

## Decision

Use **Astro** (v6) at `apps/web/` as the public site + tenant portal + admin dashboard. Park `apps/lynx/` indefinitely. Mobile is deferred to a PWA derived from the Astro app (see [ADR-0003](./0003-pwa-not-native.md), S9 of the 2026-05-20 superpower plan).

### Why Astro specifically

- **SSR + prerender on the same project.** Marketing pages prerender; portal/admin stay SSR (see [F4 in the superpower plan](../superpowers/plans/2026-05-20-superpower-plan.md)).
- **Islands architecture.** Heavy interactive UI (forms, photo upload) ships as React islands; the rest is server-rendered HTML.
- **First-class TypeScript + Vite.** Plays well with the existing `@ar/shared` package.
- **Cloud-portable.** Single config switches between Vercel and Cloudflare Workers/Pages adapters.

### Why not React Native + Expo (the obvious alternative)

- Adds a second runtime + a second deploy target (App Store, Play Store) without serving the SEO-critical public site at all.
- Apple Developer + Google Play accounts not yet live; would block launch.
- A PWA reaches install-on-home-screen on both platforms with one codebase.

## Consequences

- The Lynx workspace stays on disk for reference but is removed from `pnpm-workspace.yaml` as part of S9. No further investment.
- Mobile-specific native APIs (deep biometric auth, document scanning, advanced camera) are unavailable until the PWA hits its limits AND a real native need surfaces. Most of the audited mobile-only features (push, offline queue, install-to-home-screen, basic camera, geolocation) are reachable via PWA.
- The `@ar/shared` package — built originally to share schemas across Lynx + future web — pivots to sharing schemas across Astro + Supabase Edge Functions, which is exactly what the F-series + S-series migrations need.
