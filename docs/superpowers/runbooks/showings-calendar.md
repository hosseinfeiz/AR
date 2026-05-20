# Showings calendar runbook

The S4 slice replaced "pick three preferred dates" with a live availability picker
tied to manager Google Calendars. This runbook covers setup, day-to-day ops, and
the known gaps.

## Architecture at a glance

```
prospect          /api/showings/availability  ─┐
   │                                          │
   ▼                                          ▼
schedule.astro  ──► ShowingPicker  ──► /api/showings/book ──► Supabase + Resend (+ICS) + Twilio (opt) + Google Calendar
                                          │
                                          └─► HMAC-signed reschedule_token (in email + ICS link)
                                                  │
                                                  └─► /api/showings/reschedule (GET form / POST update)
```

Every booking is stored in `public.showing_requests` with `status='scheduled'`,
`scheduled_at = picked_slot_start`, and `reschedule_token_hash = sha256(token)`.

## One-time setup

### 1. `RESCHEDULE_SECRET`

```sh
openssl rand -hex 32
```

Set the resulting value as `RESCHEDULE_SECRET` in your deployment env (Cloudflare
Workers vars + Vercel env). Rotating the secret invalidates every outstanding
reschedule link, which is fine in an emergency but inconvenient otherwise — prefer
the per-row rotation that happens automatically on each reschedule.

### 2. Google OAuth app

1. https://console.cloud.google.com/ → create a project (or reuse).
2. Enable the **Google Calendar API**.
3. OAuth consent screen: **External**; add the manager emails as test users while
   the app is in "Testing" mode (no review required for ≤100 test users).
4. Credentials → Create OAuth client → **Web application**:
   - Authorized redirect URI: `https://<your-host>/api/oauth/google-calendar/callback`
     (add a localhost variant for dev).
5. Copy client id + secret into `GOOGLE_OAUTH_CLIENT_ID` /
   `GOOGLE_OAUTH_CLIENT_SECRET`. Set `GOOGLE_OAUTH_REDIRECT_URI` to the same URL.

The scopes requested are `calendar.events` + `calendar.readonly` + `openid email`.

### 3. Per-manager connect

Each manager:

1. Logs into `/admin`.
2. Goes to **Admin → Showings Calendar** (route: `/admin/showings/calendar`).
3. Clicks **Connect a Google Calendar**, picks the Google account they want to
   sync, grants access.
4. Their refresh token is stored in `manager_calendar_connections`.

Refresh tokens are currently **plaintext in Postgres**. This is acceptable for
the small staff/internal-tool stage but should be wrapped with `pgcrypto`
envelope encryption (or stored in Cloudflare Secrets) before any wider rollout.
**TODO**: move to encrypted storage.

### 4. Twilio (optional)

If you want SMS reminders, populate the three `TWILIO_*` env vars. With
`TWILIO_AUTH_TOKEN` unset, `sendSms()` no-ops and logs — you don't need to
branch in calling code.

## Reminder sequence

Reminders fire at **T-24h** and **T-1h** before each `scheduled_at`. They reuse
the same Resend confirmation template plus an optional SMS via `lib/twilio`.

> **Not yet automated.** The current slice ships the building blocks
> (`lib/twilio`, `getShowingByRefId`, `flagNoShow`) but not a scheduler that
> walks the `showing_requests` table. Wire this into a cron worker before
> production. See `apps/web/src/lib/showings.ts` for the helpers.

## No-show flagging

Call `flagNoShow(refId)` from a manager action (button on `/admin/showings/calendar`
is **not yet wired** — see the TODO). It sets `no_show_at=now()` and
`status='no_show'`. The dashboard surfaces these as red rows.

## Failure modes & recovery

| Symptom | Cause | Fix |
| --- | --- | --- |
| Picker shows everything as "open" but bookings fail | Supabase not reachable | `npx supabase start` / check env |
| Picker shows nothing for any day | `building_id` not on allowlist or `from`/`to` parse fail | Inspect Network tab |
| Connect button missing | `GOOGLE_OAUTH_*` env unset | Configure per §2 above |
| `/api/oauth/...callback` returns `No refresh_token returned` | Google didn't re-prompt for consent | Revoke in https://myaccount.google.com/permissions, retry |
| Reschedule link 410 Gone | A newer reschedule happened (hash rotated) | Always email/SMS the latest link |
| Reschedule link 401 expired | Token older than 14 days | Manager regenerates from `/admin/showings/calendar` (TODO) |

## Known gaps (intentional)

1. Refresh tokens are plaintext — flagged above.
2. Reminder cron is not wired — helpers exist, schedule TBD.
3. Manager `no-show` button is not wired — `flagNoShow()` is callable.
4. The picker queries Google free/busy for **all** connected managers as a
   global busy filter. For per-building manager assignment, extend
   `manager_calendar_connections` with a `building_id`.
5. The 30-minute grid is hardcoded; same for the 9:00-18:00 business hours.
6. The free/busy fan-out is N×Google API calls per `/availability` hit; add a
   cache layer (KV / D1) before high traffic.
