# ADR-0003: PWA, not native (Lynx or Expo), for mobile

- **Date:** 2026-05-20
- **Status:** Accepted (driving S9 of the superpower plan)
- **Deciders:** Hossein Feiz

## Context

After [ADR-0001](./0001-lynx-to-astro.md) parked Lynx, the open question was: when the operator needs "an app you install from the App Store", how do we get there?

Three paths:
1. **Revive Lynx** (~11–15 weeks per the audit) — bleeding-edge framework, small ecosystem, doubtful App Store path.
2. **React Native + Expo** (~9–13 weeks) — mature, but a new codebase, new deploy pipeline, Apple Developer + Google Play accounts, App Store review on every release.
3. **PWA from the existing Astro app** (~2–3 weeks) — Service Worker, manifest, push API, install-to-home-screen.

## Decision

Ship a PWA. Defer native to "if and only if the PWA hits a real limit."

## Why

| Concern | PWA | Expo | Lynx |
|---|---|---|---|
| Time to first install | 2–3 weeks | 9–13 weeks | 11–15 weeks |
| Codebases to maintain | 1 (Astro) | 2 (Astro + Expo) | 2 (Astro + Lynx) |
| App Store gate / review | None | Yes (every release) | Yes |
| Apple Dev + Play accounts needed | No | Yes | Yes |
| Offline maintenance form (Service Worker queue) | ✓ | ✓ (extra wiring) | ✓ (extra wiring) |
| Push notifications | ✓ (Web Push) | ✓ (APNs/FCM) | ✓ (APNs/FCM) |
| Biometric auth | ❌ on most devices | ✓ | ✓ |
| Document scanning (heavy camera APIs) | Partial | ✓ | ✓ |
| Floor-plan-aware AR | ❌ | ✓ | ✓ |

The features the PWA can't cover (deep biometric, heavy camera, AR) are not on the active roadmap. Most of what tenants need — view lease, pay rent, submit maintenance, receive push notifications, work offline — a PWA handles fine.

## Consequences

- `apps/lynx/` is removed from `pnpm-workspace.yaml` as part of S9 but its source files remain on disk for reference. A future cleanup commit can delete the directory if no reference value remains after 6 months.
- iOS Safari does not fire `beforeinstallprompt`. The install banner for iOS users shows manual "Share → Add to Home Screen" instructions instead.
- Web Push requires a VAPID key pair (operator step, documented in `docs/superpowers/runbooks/pwa.md`). Apple added Web Push support in Safari 16.4 (March 2023); iOS 16.4+ tenants get push, older tenants don't.
- If a native need surfaces later, the Astro app's API surface is already complete + the schemas live in `@ar/shared`. A future Expo app can consume the same APIs without rewriting.
