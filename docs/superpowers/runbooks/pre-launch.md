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
Mobile app deferred to Sub-project #1.5 (`apps/lynx/` is parked).

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
