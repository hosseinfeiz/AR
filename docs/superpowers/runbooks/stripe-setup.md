# Stripe Setup Runbook (S1 — ACH Rent Collection)

This runbook walks an operator through bringing up Stripe for the A & R
Management web app. The implementation choice is **Stripe direct** (not
Connect): both buildings flow into one Stripe account.

---

## 1. Create the Stripe account

1. Sign up at https://dashboard.stripe.com/register using the operator email.
2. Complete the business profile (LLC, EIN, bank account on file).
3. In **Settings → Public business details**, set the public statement
   descriptor to `A & R MGMT RENT` so it shows correctly on tenant bank
   statements.
4. Under **Settings → Payments → Payment methods**, enable:
   - **ACH Direct Debit** (us_bank_account) — primary method.
   - **Cards** — optional fallback.

> ACH requires US bank-account verification through Stripe Financial
> Connections, which is enabled by default. Tenants log in to their bank
> via Stripe's hosted UI; no Plaid contract needed on our side.

---

## 2. Get the API keys

In **Developers → API keys**, copy:

| Variable                          | Where it goes        | Notes                                  |
| --------------------------------- | -------------------- | -------------------------------------- |
| `STRIPE_SECRET_KEY`               | server env           | `sk_test_…` in dev, `sk_live_…` prod  |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY`   | client + server env  | `pk_test_…` / `pk_live_…`             |

Set them in Vercel/Cloudflare environment variables AND in `.env.local` for
local dev. See `.env.example` for the canonical list.

---

## 3. Configure the webhook endpoint

Stripe → us notifications land at `POST /api/stripe-webhook`. To register
the endpoint:

1. In **Developers → Webhooks → Add endpoint**, enter the URL:
   - Prod: `https://<your-domain>/api/stripe-webhook`
   - Local dev: use `stripe listen` (see step 4 below).
2. Select these events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `setup_intent.succeeded`
3. After saving, copy the **Signing secret** (`whsec_…`) into the
   `STRIPE_WEBHOOK_SECRET` env var.

### What the webhook expects

- Method: `POST`.
- Header: `Stripe-Signature` (required for HMAC verification).
- Body: the raw bytes of the event payload (must not be re-encoded).
- Authentication: HMAC over the raw body using `STRIPE_WEBHOOK_SECRET`.

The handler is **idempotent**: if Stripe retries the same event the handler
checks whether a `payments` row already exists for that PaymentIntent id
before inserting. Replays are no-ops.

Event handling:

| Event                              | Effect                                              |
| ---------------------------------- | --------------------------------------------------- |
| `payment_intent.succeeded`         | Insert `payments` row + flip `charges.status='paid'`|
| `payment_intent.payment_failed`    | Flip `charges.status='failed'`                      |
| `setup_intent.succeeded`           | Insert `tenant_payment_methods` row (default if 1st)|
| Any other event                    | Logged and acknowledged with 200                    |

---

## 4. Local development

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
brew install stripe/stripe-cli/stripe   # macOS
stripe login

# Forward webhooks to your local dev server
stripe listen --forward-to http://localhost:4321/api/stripe-webhook

# The CLI prints a whsec_… value — paste that into STRIPE_WEBHOOK_SECRET
# in your .env.local (it differs from the prod secret).
```

Test triggers:

```bash
# Simulate a successful payment
stripe trigger payment_intent.succeeded

# Simulate a failed ACH debit
stripe trigger payment_intent.payment_failed

# Simulate ACH mandate confirmation
stripe trigger setup_intent.succeeded
```

---

## 5. Smoke test in the app

1. Log in as a tenant (e.g. `sarah.jensen@demo.test`).
2. Navigate to `/portal/payments`.
3. Click **Set up auto-pay** — Stripe's hosted bank picker appears.
4. Use Stripe's test bank `BANK ROUTING 110000000` / account `000123456789`
   for ACH testing.
5. Confirm the mandate; within a few seconds the page should reload with
   the green "Auto-pay active" badge.
6. Click **Pay now** on a due charge — the API returns a PaymentIntent id
   and an RCP receipt number. The `payments` row is written when the bank
   actually settles (1-5 business days in live, instantly in test mode).

---

## 6. Operational notes

- **Disputes/chargebacks**: ACH disputes are rare but cost $15 each plus
  the reversed amount. Monitor the Stripe dashboard's **Disputes** page.
- **Refunds**: not yet automated — issue from the Stripe dashboard for
  the time being; the `payments` row should be manually reconciled.
- **Failed debits**: when an ACH debit bounces (NSF, account closed),
  Stripe sends `payment_intent.payment_failed`. The handler flips the
  charge back to `failed`; staff should follow up with the tenant.
- **Per-tenant default method**: only the first
  `tenant_payment_methods` row is marked `is_default=true`. Operators can
  change the default via direct DB update for now (admin UI TBD).
