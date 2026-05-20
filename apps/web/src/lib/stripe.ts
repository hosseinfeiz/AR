// Server-side Stripe client factory + small helpers.
//
// All Stripe interaction (SetupIntent, PaymentIntent, webhook verification)
// goes through this module. The factory is lazy so missing env vars at build
// time don't crash module load — they only blow up at request time, which is
// what we want for serverless deploys.

import Stripe from 'stripe'

let _client: Stripe | null = null

/**
 * Returns a singleton server-side Stripe client.
 * Throws if `STRIPE_SECRET_KEY` is not set in the runtime environment.
 *
 * We intentionally do NOT pin `apiVersion` — the SDK defaults to the
 * version baked into the installed package, which is what we want for
 * deterministic builds (`pnpm-lock.yaml` pins the SDK version).
 */
export function getStripe(): Stripe {
  if (_client) return _client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  _client = new Stripe(key, {
    typescript: true,
    appInfo: { name: 'ar-management-web', version: '0.0.1' },
  })
  return _client
}

/** For tests — swap the singleton with a mock. */
export function __setStripeForTesting(s: Stripe | null) {
  _client = s
}

/**
 * Verifies a Stripe webhook payload using the configured webhook secret.
 *
 * `rawBody` MUST be the raw bytes/string of the request — do NOT JSON.parse
 * before passing in, or signature verification will fail.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | null,
  secret?: string,
): Stripe.Event {
  const whSecret = secret ?? process.env.STRIPE_WEBHOOK_SECRET
  if (!whSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  }
  if (!signature) {
    throw new Error('Missing Stripe-Signature header')
  }
  const stripe = getStripe()
  // constructEvent throws on bad signature — caller should 400 in that case.
  return stripe.webhooks.constructEvent(rawBody, signature, whSecret)
}

/**
 * Find-or-create a Stripe Customer for a tenant. We pass the tenant id in
 * metadata so we can map Stripe events → our tenant rows in the webhook.
 */
export async function findOrCreateCustomer(params: {
  tenantId: string
  email?: string | null
  name?: string | null
  existingCustomerId?: string | null
}): Promise<Stripe.Customer> {
  const stripe = getStripe()
  if (params.existingCustomerId) {
    const c = await stripe.customers.retrieve(params.existingCustomerId)
    if (!('deleted' in c) || !c.deleted) {
      return c as Stripe.Customer
    }
  }
  return stripe.customers.create({
    email: params.email ?? undefined,
    name: params.name ?? undefined,
    metadata: { tenant_id: params.tenantId },
  })
}

/**
 * Create a SetupIntent for collecting an ACH mandate (or card) without
 * immediately charging the tenant. We default to `us_bank_account` since the
 * operator chose ACH-first; the client island may pass `card` if the tenant
 * opts into card payments.
 */
export async function createSetupIntent(params: {
  customerId: string
  paymentMethodType?: 'us_bank_account' | 'card'
  tenantId: string
}): Promise<Stripe.SetupIntent> {
  const stripe = getStripe()
  const type = params.paymentMethodType ?? 'us_bank_account'
  return stripe.setupIntents.create({
    customer: params.customerId,
    payment_method_types: [type],
    usage: 'off_session',
    metadata: { tenant_id: params.tenantId },
  })
}

/**
 * Create a PaymentIntent that charges a previously-collected payment method
 * for a specific charge row. `chargeId` and `tenantId` are stamped into
 * metadata so the webhook can update the right rows.
 *
 * For ACH off-session collection we set `confirm: true` so Stripe attempts
 * the debit immediately. The intent transitions to `processing` and lands as
 * `succeeded`/`failed` via webhook on the bank's timetable (1-5 business
 * days).
 */
export async function createPaymentIntent(params: {
  amountCents: number
  customerId: string
  paymentMethodId: string
  paymentMethodType: 'us_bank_account' | 'card'
  tenantId: string
  chargeId: string
  description: string
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe()
  return stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: 'usd',
    customer: params.customerId,
    payment_method: params.paymentMethodId,
    payment_method_types: [params.paymentMethodType],
    confirm: true,
    off_session: true,
    description: params.description,
    metadata: {
      tenant_id: params.tenantId,
      charge_id: params.chargeId,
    },
  })
}

/** Generate a deterministic-ish RCP receipt number from a PaymentIntent id. */
export function receiptNumberFromPI(piId: string): string {
  // PaymentIntent ids look like "pi_3Pabc..." — slice the entropy portion.
  const tail = piId.replace(/^pi_/, '')
  const a = tail.slice(0, 4).toUpperCase().padEnd(4, '0')
  const b = tail.slice(4, 8).toUpperCase().padEnd(4, '0')
  return `RCP-${a}-${b}`
}
