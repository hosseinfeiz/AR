# Synthetic monitoring runbook

Black-box availability monitoring for the AR Management web app. Built on top of
the `/api/health` readiness probe added in F7.

## What we monitor

`/api/health` returns a JSON body shaped like:

```json
{
  "ok": true,
  "ts": "2026-05-20T18:42:11.013Z",
  "request_id": "…",
  "dependencies": {
    "supabase": { "ok": true,  "latency_ms": 23 },
    "resend":   { "ok": true,  "latency_ms": 45 },
    "sentry":   { "ok": null, "note": "not checked from server" }
  },
  "degraded": false,
  "mock": false
}
```

Status code is `200` when healthy, `503` when any dependency is failing
(`degraded: true`). That makes the endpoint usable as both an HTTP-level and
content-level health signal.

## Primary monitor: Better Stack Uptime

We use **Better Stack Uptime** (formerly Better Uptime). One monitor per
environment.

### Setup (operator task — one-time)

1. Sign in at https://betterstack.com/uptime with the `armgmt.co@gmail.com`
   workspace.
2. Click **New monitor → HTTP(S) monitor**.
3. Configure:
   - **URL:** `https://<prod-host>/api/health`
   - **Request method:** `GET`
   - **Check frequency:** every **2 minutes** (use 3 minutes on the free tier)
   - **Request timeout:** `10s`
   - **Regions:** at minimum `us-east` and `eu-west`
   - **Expected status codes:** `200` only (do **not** add `2xx`)
   - **Keyword on response body:** required to contain `"ok":true` AND must
     **not** contain `"degraded":true`. Use Better Stack's "Required keyword"
     and "Forbidden keyword" together.
4. Set **On-call escalation:**
   - First responder: armgmt.co@gmail.com (email + push)
   - Escalate to SMS after 5 minutes if unacknowledged
5. **Incident severity rules:**
   - 1 failed check → soft alert (no page)
   - 2 consecutive failures → page on-call
6. Save and verify with a manual run.

### Why this shape

- HTTP 503 catches outright outages (CDN, build, runtime crash).
- The `"degraded":true` keyword catches partial outages where the app is
  reachable but Supabase or Resend is unreachable. Without the keyword check we
  would miss those — the response is still well-formed JSON, just with a 503.
- The `"ok":true` required keyword is belt-and-suspenders against an
  unexpected 200 with empty body (e.g., a misconfigured CDN serving cached
  garbage).

### What an alert looks like

> ALERT — ar-management /api/health degraded
> URL: https://ar-management.example/api/health
> Status: 503
> Body: `{ "ok": false, "degraded": true, "dependencies": { "supabase": { "ok": false, "latency_ms": 2007, "error": "fetch failed" }, … } }`
> Region: us-east-1

Pair this with the application logger output (`request_id` is in the response
header `x-request-id`, and the log line `health: supabase check failed` carries
the same id) for triage.

## Fallback: GitHub Actions cron (no third-party)

If Better Stack is unavailable or the operator wants a zero-cost fallback, we
ship a GitHub Actions workflow at `.github/workflows/synthetic-health.yml` that
hits `/api/health` every 5 minutes and opens an issue on failure.

The workflow is **disabled by default** (`if: false` on the job) so it does not
silently start running and consuming Actions minutes. The operator opts in by:

1. Setting the `HEALTH_URL` repo variable to the production URL.
2. Removing the `if: false` guard on the `check` job in
   `.github/workflows/synthetic-health.yml`.
3. Optionally adding a `SLACK_WEBHOOK` secret to also post to Slack on failure
   (workflow accepts the secret but doesn't require it).

The workflow uses only `curl` and `gh` — no external dependencies.

### Trade-offs

- Cheap but **5-minute resolution** (Actions minimum schedule). Better Stack
  catches issues faster.
- Issues created by the workflow include the response body and the
  `x-request-id` header so they can be correlated with app logs.
- No on-call paging — just opens GitHub issues. Pair with a "watch issues"
  notification rule on the repo if you want to be emailed.

## Pick one

For production launch: **Better Stack as the primary**, GitHub Actions
optionally on as a redundant backstop. Do not run only the GitHub Actions
workflow — 5-minute resolution and no escalation isn't enough for a billing /
maintenance app where tenants expect immediate response.
