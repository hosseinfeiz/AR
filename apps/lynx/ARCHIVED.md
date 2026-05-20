# apps/lynx — ARCHIVED

**Status:** Parked as of 2026-05-20.

The Lynx-based mobile prototype has been retired in favor of a Progressive Web
App (PWA) shipped from `apps/web`. The PWA gives us:

- One codebase (Astro + React) targeting web and installed app surfaces.
- Offline maintenance-request submission via a Background-Sync queue.
- Web Push status updates (server-side helper in `apps/web/src/lib/push.ts`).
- iOS support via "Add to Home Screen" (no PWA install prompt on iOS Safari).

## What's archived

- This directory (`apps/lynx/`) is no longer listed in `pnpm-workspace.yaml`,
  so `pnpm install` does not pull its dependencies. The source files remain on
  disk for reference until a future cleanup deletes them.
- CI/build pipelines should skip this app.

## How to read this code

If you need to revisit the Lynx prototype:

1. Re-add `"apps/lynx"` to `pnpm-workspace.yaml`.
2. Run `pnpm install` from the repo root.
3. Follow `apps/lynx/README.md` for the dev loop.

## How to delete it

When confident nothing references the directory:

```bash
git rm -r apps/lynx
```

Then update any stale documentation that still mentions Lynx.

## Why we switched

See `docs/superpowers/runbooks/pwa.md` for the PWA design notes and rollout
plan. The short version: PWA + Web Push hits the same install + notification
UX we wanted from Lynx without requiring App Store / Play Store builds, and
shares the auth + portal code we already maintain in Astro.
