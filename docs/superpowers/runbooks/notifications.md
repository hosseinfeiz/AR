# Notifications runbook

## Overview

Three pieces work together to deliver notifications:

1. `supabase/functions/notify-on-new-request` — triggered by DB webhooks on
   `INSERT` to `showing_requests` / `maintenance_requests`. For each manager:
   - inserts a row into `notifications` (in-app inbox)
   - decides whether to send the email immediately or leave the row queued
   - always emails an emergency notification regardless of prefs
   - always sends the submitter confirmation
2. `supabase/functions/batch-notifications` — periodically picks up un-sent
   `notifications` rows, groups by recipient, sends a digest, marks `sent_at`.
3. `apps/web` — admin UI for preferences (`/admin/notifications/preferences`)
   and the inbox (`/admin/notifications/inbox`). Resend events flow into
   `email_events` via `apps/web/src/pages/api/webhooks/resend.ts`.

## Database

- `manager_preferences (manager_email pk, quiet_hours_start, quiet_hours_end, batch_after_count, filters jsonb, updated_at)`
- `notifications (id, recipient_email, kind, payload jsonb, sent_at?, read_at?, created_at)`
- `email_events (id, provider_message_id, kind, raw jsonb, received_at)`

RLS uses `public.is_manager()`:

- `manager_preferences` — manager may select/insert/update their own row.
- `notifications` — manager may read & update their own rows (used to mark
  read). Inserts come from the edge function via the service role and bypass
  RLS.
- `email_events` — managers may read; writes are service-role only.

## Decision logic (`shouldDeliverNow`)

Order of evaluation, first match wins:

1. No prefs → deliver now.
2. `urgency === 'emergency'` → deliver now (override).
3. Current UTC wall-clock is inside `quiet_hours_start..quiet_hours_end` →
   queue.
4. Filters reject this kind/urgency/issue → queue.
5. `batch_after_count > 1` → queue.
6. Otherwise → deliver now.

The `filters` JSONB schema:

```
{
  "urgencies": ["emergency", "high", "normal", "low"],
  "kinds":     ["maintenance_request", "showing_request", "digest", "system"],
  "issues":    ["plumbing", "electrical", "hvac", ...]   // lowercased
}
```

An empty array (or missing key) means "no restriction".

## Scheduling the batch function

Two supported modes:

### `pg_cron`

```sql
-- once enabled in your Supabase project
select cron.schedule(
  'batch-notifications',
  '*/5 * * * *',  -- every 5 minutes
  $$
    select net.http_post(
      url := 'https://<project-ref>.functions.supabase.co/batch-notifications?older_than_minutes=10',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

### Manual

```sh
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_FUNCTIONS_URL/batch-notifications?older_than_minutes=10"
```

Dry-run (no email sent, no rows updated):

```sh
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_FUNCTIONS_URL/batch-notifications?older_than_minutes=10&dry_run=1"
```

## Resend webhook

Point Resend at `https://<your-web-domain>/api/webhooks/resend`. Configure a
shared secret in `RESEND_WEBHOOK_SECRET` (in `.env`) and add a matching
`x-resend-secret` header to the Resend webhook config. If the env var is unset
the route accepts any caller (dev mode only).

Event types accepted: `email.sent`, `email.delivered`, `email.bounced`,
`email.complained`, `email.opened`, `email.clicked`, `email.delivery_delayed`,
`email.failed`. Anything else is logged + ignored.

## Emergency-only override

`urgency === 'emergency'` bypasses quiet hours, filters, and batching. This is
non-configurable. If a manager truly does not want emergency emails, remove
them from the allowlist.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Manager sees no inbox rows | RLS denied. `is_manager()` returned false. | Ensure the manager email is in `managers_allowlist` and they're authenticated. |
| Edge function logs `notifications insert failed` | Migration not applied. | Run `supabase db push`. |
| Digest never arrives | `batch_after_count` not yet met. | Lower threshold in `/admin/notifications/preferences` or wait for more items. |
| Resend webhook 401 | `RESEND_WEBHOOK_SECRET` mismatch. | Re-sync secret in Resend dashboard. |
| Quiet hours not respected | UTC offset mismatch. | The function compares against UTC wall-clock. Convert local times to UTC before saving. |
