# Vendor Dispatch Runbook (S6)

This runbook covers the day-to-day operation of the maintenance vendor
dispatch system added in S6: vendor directory, COI tracking, work-order
auto-dispatch on emergency/high urgency, SLA monitoring, and the
tenant-facing satisfaction survey.

## Overview

```
Tenant submits request  →  Manager sees it on /admin/maintenance
        ↓                        ↓
   (auto-pick a              SLA badge tells manager
    vendor on               how urgent it is to act
    emergency)                       ↓
        ↓                  /admin/maintenance/[id]/dispatch
   SMS to vendor                     ↓
        ↓                  Work-order created
   /vendor/[token]                   ↓
   Vendor updates              Survey link sent
   status → completed         when tenant request
                              resolves (portal pill)
```

## Roles

- **Manager (admin session)** — owns the vendor directory at
  `/admin/vendors`, reviews the maintenance queue at
  `/admin/maintenance`, and dispatches vendors via
  `/admin/maintenance/[id]/dispatch`.
- **Vendor (no login)** — receives an SMS with a signed link to
  `/vendor/[token]` and updates the job status from there.
- **Tenant (portal session)** — sees a "Give feedback" pill on resolved
  requests at `/portal/maintenance`, linking to
  `/maintenance-survey/[token]`.

## Onboarding a vendor

1. Navigate to **Admin → Vendors → + Add vendor**.
2. Fill in name, category, contact info, and (if known) license number.
3. Upload the Certificate of Insurance to the `vendor-coi` storage
   bucket and paste the storage path in **COI storage path**.
4. Set the **Insurance expiry date** so the COI warning system picks it
   up 30 days before expiry.
5. Tick the buildings the vendor services and leave **Active**
   checked. Save.

> The vendor directory page surfaces a yellow banner listing all
> vendors with an expiring (≤30 d) or expired COI plus vendors with no
> COI on file.

## Dispatching a vendor

### Manual dispatch (default for normal / low urgency)

1. On `/admin/maintenance`, click **Dispatch →** on any unassigned row.
2. The form pre-selects the highest-rated active vendor matching the
   issue category and building. Adjust if needed.
3. Pick an initial status (Scheduled, Quoted, In progress) and add
   notes. Submit.
4. The system:
   - Creates a `work_orders` row.
   - Records `vendor_assigned_at` on the maintenance request.
   - Sends an SMS to the vendor's phone with a `/vendor/[token]` link
     (via `lib/twilio.ts` when configured; otherwise the message is
     logged).

### Auto-dispatch (emergency or high urgency)

`shouldAutoDispatch(urgency)` returns true for `emergency` and `high`.
The Dispatch screen flags such requests with an amber banner. In
production a background job can call the dispatch API directly:

```http
POST /api/admin/maintenance/{request_id}/dispatch
content-type: application/json
{
  "vendor_id": "<picked by pickAutoDispatchVendor()>",
  "status": "scheduled",
  "notes": "Auto-dispatched"
}
```

## SLA tracking

Thresholds (defined in `apps/web/src/lib/sla.ts`):

| urgency   | ack    | start  | complete |
| --------- | ------ | ------ | -------- |
| emergency | 30 min | 4 h    | 24 h     |
| high      | 4 h    | 24 h   | 72 h     |
| normal    | 24 h   | 5 d    | 14 d     |
| low       | 7 d    | 14 d   | 30 d     |

Each milestone is bucketed as:

- **on-track** — milestone met before deadline, or <75% of budget
  elapsed.
- **warning** — ≥75% of budget elapsed and milestone unmet.
- **breached** — deadline passed and milestone unmet (or met after).

The queue at `/admin/maintenance` sorts by worst-bucket-first.

## Acknowledging a request

Admins acknowledge a request by hitting:

```http
POST /api/admin/maintenance/{request_id}/acknowledge
```

This sets `acknowledged_at` and (if status was `new`) advances status
to `acknowledged`. Tracked against the **ack** SLA milestone.

## Vendor portal

The SMS link is `/vendor/<token>` where `<token>` is an HMAC-signed
payload `{ kind: 'wo', id: work_order_id, iat }` (secret is
`VENDOR_PORTAL_SECRET`).

The vendor page lets the vendor PATCH the status:

```http
PATCH /api/work-orders/{work_order_id}/status?token=<token>
content-type: application/json
{ "status": "in_progress", "notes": "Arrived on site" }
```

On the first status update the work order's `acknowledged_at` is set;
moving to `in_progress` stamps `started_at`, and `completed` stamps
`completed_at`.

## Tenant satisfaction survey

When a maintenance request transitions to `resolved`, the tenant sees
a violet **Give feedback →** pill on `/portal/maintenance`. The link
points to `/maintenance-survey/<token>` where the token has
`kind: 'sv'`. Submissions go to `/api/maintenance-survey/<token>/submit`
and write a row into `maintenance_surveys`.

A request can only be surveyed once — the unique index
`uq_survey_per_request` enforces this server-side.

## Rotating the HMAC secret

Setting a new value for `VENDOR_PORTAL_SECRET` invalidates all
outstanding vendor and survey links. Re-dispatch active work orders to
issue fresh links.

## Troubleshooting

- **"Invalid or expired link"** — token signature mismatch. Either the
  secret was rotated or the URL was truncated. Re-dispatch to issue a
  new link.
- **No SMS arriving** — check `RESEND_API_KEY`/Twilio env vars. With
  Twilio unset, the dispatch endpoint logs `twilio.no-op` and the
  vendor must be contacted manually with the URL from the logs.
- **COI banner stuck on a vendor** — check `insurance_expiry_date` on
  `/admin/vendors/{id}`; the banner is driven by `coiStatus()` which
  flags vendors within 30 days of expiry.
