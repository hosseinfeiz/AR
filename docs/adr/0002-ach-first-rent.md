# ADR-0002: ACH-first (not card-first) for rent collection

- **Date:** 2026-05-20
- **Status:** Accepted (driving S1 of the superpower plan)
- **Deciders:** Hossein Feiz

## Context

S1 of the [2026-05-20 superpower plan](../superpowers/plans/2026-05-20-superpower-plan.md) replaces the demo `/api/portal/pay-charge.ts` (which mutates an in-memory fixture and returns a fake receipt) with real payment processing via Stripe.

Two account models in Stripe:
- **Direct charges** — single Stripe account; all funds settle to one bank.
- **Connect** — sub-accounts per legal entity; funds route across multiple banks.

Two payment instruments:
- **Cards** — instant, ~2.9% + $0.30 per transaction, supports recurring SCA flows.
- **ACH (US Bank Account)** — 4–5 business day settlement, $0.80 flat or 0.8% capped at $5.

## Decision

- **Stripe direct charges** (one account). Both buildings flow into the same bank, with `building_id` tagged on each PaymentIntent for accounting. Migrate to Connect later if a second legal entity needs separate fund routing.
- **ACH-first** at the UI level. The portal's "Set up auto-pay" button mounts the ACH flow first; cards remain available as a manual one-off fallback.

## Why

1. **Fee math.** $1,500/mo rent × 2.9% + $0.30 = **$43.80 per card payment**. Same rent via ACH = **$5 cap**. Across 50 units × 12 months that's **$23,000+/yr** saved.
2. **Recurring is the goal.** Rent is the most predictable recurring charge in the business; ACH mandate + scheduled PaymentIntents is the boring, correct primitive.
3. **Connect adds complexity we don't need yet.** Both buildings are owned by the same operator (per `AR.md`). The cost of Connect (separate onboarding, transfer fees, more failure modes) is not justified by a single bank account.
4. **One Stripe account simplifies reconciliation.** Daily Stripe payouts → one bank → one ledger.

## Consequences

- Late fees are charged manually (or via a separate PaymentIntent) since ACH doesn't support "decline → retry" semantics cleanly. We need an explicit dunning flow (planned as part of S1's late-fee engine).
- ACH disputes ("unauthorized debit") have a longer dispute window than cards (up to 60 days for consumers under Reg E). Surface this in the portal: tenants must approve the mandate; we keep a copy of the SetupIntent ToS.
- Switching to Connect later requires migrating customers + mandates per Stripe's Connect-migration guide. Not free, but cheap to defer.
- The `tenant_payment_methods` table introduced by S1 stores `stripe_customer_id` per tenant — easy to evolve into Connect-managed customers later.
