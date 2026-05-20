# Data model — ERD

Generated from `supabase/migrations/*.sql` as of 2026-05-20 (after F1 schema landed; S-series additions noted at the bottom and will be folded in after S-merges complete).

## Diagram

```mermaid
erDiagram
    buildings ||--o{ units : "has"
    buildings ||--o{ building_photos : "has"
    buildings ||--o{ availability_slots : "for"
    buildings ||--o{ showing_requests : "about"
    buildings ||--o{ maintenance_requests : "about"
    buildings ||--o{ tenants : "houses"
    units ||--o{ unit_photos : "has"
    units ||--o{ availability_slots : "for"
    units ||--o{ showing_requests : "about"
    units ||--o{ tenants : "houses"
    units ||--o{ leases : "covers"
    availability_slots ||--o| showing_requests : "booked by"
    tenants ||--o{ leases : "signs"
    tenants ||--o{ charges : "owes"
    tenants ||--o{ payments : "makes"
    tenants ||--o{ messages : "receives"
    leases ||--o{ charges : "generates"
    charges ||--o| payments : "settled by"
    auth_users ||--o{ maintenance_requests : "assigned to"
    auth_users ||--o{ audit_log : "actor"
    managers_allowlist ||--o| auth_users : "permits signup"

    buildings {
        uuid id PK
        text slug UK
        text name
        text address_line1
        text city
        text state
        text postal_code
        text contact_email
        text contact_phone
        boolean is_published
        timestamptz created_at
        timestamptz updated_at
    }
    units {
        uuid id PK
        uuid building_id FK
        text unit_number
        smallint bedrooms
        numeric bathrooms
        int sqft
        int monthly_rent_cents
        int deposit_cents
        date available_from
        text status "available|leased|coming_soon|off_market"
        text description_md
    }
    building_photos {
        uuid id PK
        uuid building_id FK
        text storage_path
        text alt_text
        int sort_order
    }
    unit_photos {
        uuid id PK
        uuid unit_id FK
        text storage_path
        text alt_text
        int sort_order
    }
    availability_slots {
        uuid id PK
        uuid building_id FK
        uuid unit_id FK
        timestamptz starts_at
        timestamptz ends_at
        text status "open|booked|blocked"
        uuid booked_by_request_id FK
    }
    showing_requests {
        uuid id PK
        text ref_id UK
        uuid building_id FK
        uuid unit_id FK
        uuid slot_id FK
        text prospect_name
        text prospect_email
        text prospect_phone
        jsonb preferred_dates
        text status "new|scheduled|completed|cancelled"
        timestamptz created_at
    }
    maintenance_requests {
        uuid id PK
        text ref_id UK
        uuid building_id FK
        text unit_number
        text tenant_name
        text tenant_email
        text issue_type
        text urgency "low|normal|high|emergency"
        text description
        text[] photo_paths
        text status "new|acknowledged|in_progress|resolved|closed"
        uuid assigned_to FK
        text manager_notes
        timestamptz created_at
        timestamptz updated_at
    }
    audit_log {
        bigserial id PK
        text table_name
        uuid record_id
        text action "insert|update|delete|status_change"
        uuid actor_id FK
        jsonb diff
        timestamptz created_at
    }
    managers_allowlist {
        text email PK
        text role
        timestamptz added_at
    }
    tenants {
        uuid id PK
        text name
        text email UK
        text phone
        uuid building_id FK
        uuid unit_id FK
        text unit_label
        date move_in_date
        text password_sha256
        timestamptz deleted_at
    }
    leases {
        uuid id PK
        uuid tenant_id FK
        uuid unit_id FK
        date start_date
        date end_date
        int monthly_rent_cents
        int security_deposit_cents
        text status "pending|active|ended"
        timestamptz signed_at
        text signed_pdf_path
        boolean auto_renew
        smallint notice_period_days
    }
    charges {
        uuid id PK
        uuid lease_id FK
        uuid tenant_id FK
        text description
        int amount_cents
        date due_date
        text status "due|paid|overdue|waived"
        uuid paid_payment_id FK
        text stripe_payment_intent_id
    }
    payments {
        uuid id PK
        uuid tenant_id FK
        uuid charge_id FK
        int amount_cents
        timestamptz paid_at
        text method "ach|card|cash|check|other"
        text receipt_number UK
        text stripe_payment_intent_id
    }
    messages {
        uuid id PK
        uuid tenant_id FK
        text from_name
        text from_role "manager|tenant|system"
        text subject
        text body
        text category
        timestamptz sent_at
        timestamptz read_at
    }
```

## Conventions

- All business tables include `created_at` (default `now()`), `updated_at` (touched by `set_updated_at()` trigger from migration `0100_init.sql`), and — where soft-delete applies — `deleted_at`.
- Foreign keys default to `on delete restrict` to avoid surprise cascades on financial data. The exceptions: `building_photos.building_id` and `unit_photos.unit_id` cascade so cleaning up a building/unit removes its photo refs.
- RLS is on for every business table. `anon` can read published `buildings` + `available` units only. `authenticated` users who pass the `is_manager()` check (added in migration `20260520000100_rls_tighten.sql`) can read/mutate everything. Tenant self-read policies are pending tenant-side Supabase Auth integration; until then portal reads use the service-role client.
- The `audit_log` table is populated by `write_audit()` triggers on every business table (`trg_audit_*`). Migration `20260520000300` extends coverage to `tenants/leases/charges/payments/messages`.

## In-flight additions (S-series, pending merge)

These tables are landing as part of the S-series feature work and will appear in the next regeneration of this doc:

| Slice | New tables / columns |
|---|---|
| S1 | `tenant_payment_methods` |
| S2 | `applicants`, storage bucket `leases` |
| S3 | `lease_documents`, `lease_chunks` (with `pgvector`) |
| S4 | `manager_calendar_connections`; new columns on `showing_requests` |
| S5 | `manager_preferences`, `notifications`, `email_events` |
| S6 | `vendors`, `work_orders`, `maintenance_surveys`; new SLA columns on `maintenance_requests`; storage bucket `vendor-coi` |
| S9 | `push_subscriptions` |
