# Applicant Pipeline — Operator Runbook

The applicant pipeline takes a prospect from first contact through a signed
lease. The pipeline is intentionally simple and operator-driven: a manager
clicks through each stage from the **Applicants** Kanban board at
`/admin/applicants`.

## The 5 stages (plus Withdrawn)

| Status        | Meaning                                              | What happens here                                    |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `inquiry`     | Someone reached out, contact captured.               | Operator decides whether to invite an application.   |
| `application` | Full application data on file (income, target unit). | Ready for screening.                                 |
| `screening`   | Background/credit screen has been requested.         | When the recommendation arrives, advance.            |
| `lease_ready` | Lease PDF generated and sent for signature.          | Waiting on signature webhook.                        |
| `signed`      | Counter-party signed; tenant has been provisioned.   | Terminal. A `tenants` row + first month charge live. |
| `withdrawn`   | Applicant pulled out (or was declined).              | Terminal.                                            |

## Transition table (server-enforced)

```
inquiry      → application | withdrawn
application  → screening   | withdrawn
screening    → lease_ready | application | withdrawn
lease_ready  → signed      | withdrawn
signed       → (terminal)
withdrawn    → (terminal)
```

The state machine lives in `apps/web/src/lib/applicants.ts` and is enforced
by `PATCH /api/admin/applicants/:id/status`. Illegal transitions return
`409 Conflict`.

## End-to-end happy path

1. **Inquiry → Application.**
   On the detail page, click "Advance status → Application".
   Confirm we have a target unit, move-in date, and income on file.

2. **Application → Screening.**
   Click "Run TransUnion screening".
   Server calls `runScreening()` from `src/lib/screening.ts`.
   - If `SMARTMOVE_API_KEY` is set, the live SmartMove API is hit.
   - Otherwise a deterministic mock score (500-800) is recorded.
   The applicant auto-advances to `screening` and the score/recommendation
   are persisted.

3. **Screening → Lease-Ready.**
   Only available when `screening_recommendation === 'accept'`.
   Click "Generate & send lease". The server:
   - Renders a PDF lease from `src/lib/lease-pdf.ts`.
   - Sends it via Dropbox Sign (`sendForSignature` in `src/lib/esign.ts`).
   - If `DROPBOX_SIGN_API_KEY` is unset, a mock envelope id is generated and
     a preview URL is returned.
   - Transitions the applicant to `lease_ready`.

4. **Lease-Ready → Signed (webhook-driven).**
   When the signer completes the document, Dropbox Sign POSTs to
   `/api/webhooks/esign`. The server:
   - Resolves the applicant by `envelope_id` (or by `applicant_id` metadata).
   - Transitions the applicant to `signed`.
   - Inserts a `tenants` row, `leases` row (with `signed_at` and
     `signed_pdf_path`), and a first-month `charges` row.
   In mock mode, the detail page has a "Simulate signed" button that POSTs
   a flat-shape webhook to the same endpoint.

## Withdrawn

Any stage except `signed` can move directly to `withdrawn`. Use this when:
- Applicant pulled out.
- We declined them and want to clear the board.
- The Dropbox Sign webhook reports `signature_request_declined` —
  the route automatically transitions to `withdrawn`.

## Env vars

```
SMARTMOVE_API_KEY=        # unset → deterministic mock
DROPBOX_SIGN_API_KEY=     # unset → mock envelope + in-app preview
DROPBOX_SIGN_TEAM_ID=     # optional, for team-scoped Dropbox Sign accounts
```

The pipeline is fully functional in mock mode — no third-party signups
required for dev / staging.

## Where the data lives

- **Table:** `applicants` (created by
  `supabase/migrations/20260520010200_applicants.sql`).
- **Storage:** `leases` bucket — final signed PDFs land here under
  `leases/<applicant_id>/<envelope_id>.pdf`.
- **Tenant provisioning:** webhook inserts into the `tenants`, `leases`,
  and `charges` tables. Stripe pickup of the first-month charge is owned by
  the rent-collection pipeline (S1).

## Degraded mode

When `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are unset, the entire
applicant pipeline operates against an in-process fixture store. The UI
remains fully functional for demos. Provisioning of tenants/leases/charges
in the webhook is best-effort and no-ops when the Supabase env isn't set
or the F1 schema isn't yet migrated.

## Common operations

### Pull the list of overdue screenings
```sql
select id, name, email, created_at
from applicants
where status = 'application' and created_at < now() - interval '5 days';
```

### Force a withdrawn → withdrawn cleanup (soft delete)
```sql
update applicants
   set deleted_at = now()
 where status = 'withdrawn' and updated_at < now() - interval '90 days';
```

### Inspect the audit log for an applicant
```sql
select created_at, action, actor_id, diff
from audit_log
where table_name = 'applicants' and record_id = '<applicant_id>'
order by created_at desc;
```
