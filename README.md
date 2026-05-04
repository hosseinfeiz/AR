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
7. `pnpm --filter @ar/web dev` (starts Astro dev server at http://localhost:4321).

## Current state

The Lynx mobile app (`apps/lynx/`) is parked pending Sub-project #1.5. The active web frontend is the Astro app at `apps/web/`, which replaced the Lynx web target. See `docs/superpowers/specs/2026-05-04-astro-web-spec.md` for the full web spec and `docs/superpowers/plans/2026-05-04-astro-web-plan.md` for the implementation plan.
