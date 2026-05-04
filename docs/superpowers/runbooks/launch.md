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
7. Configure Postgres `app.edge_functions_url` and `app.anon_key` settings against the production database:
   ```bash
   psql "<prod-db-url>" -c "alter system set app.edge_functions_url = 'https://<project-ref>.supabase.co/functions/v1';"
   psql "<prod-db-url>" -c "alter system set app.anon_key = '<prod-anon-key>';"
   psql "<prod-db-url>" -c "select pg_reload_conf();"
   ```
8. Deploy Edge Functions: `supabase functions deploy notify-on-new-request request-upload-urls health`.
9. Add custom domain to Vercel; point DNS A/CNAME records.
10. Verify Resend sending domain DNS (DKIM, SPF) records.
11. First-deploy QA matrix: run the manual mobile QA checklist (`mobile-qa.md`).

## GitHub Secrets required for `deploy-web.yml`

- `SUPABASE_PROD_REF` — your project ref (e.g. `abcdefgh`)
- `SUPABASE_ACCESS_TOKEN` — personal access token from supabase.com/dashboard/account/tokens
- `SUPABASE_DB_PASSWORD` — production database password

## Local-dev parity

For local development, the equivalent of step 7 is:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "alter system set app.edge_functions_url = 'http://host.docker.internal:54321/functions/v1';"
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "alter system set app.anon_key = '$(grep VITE_SUPABASE_ANON_KEY .env | cut -d= -f2)';"
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -c "select pg_reload_conf();"
```
