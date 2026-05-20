export const prerender = false
import type { APIRoute } from 'astro'
import type Stripe from 'stripe'
import { verifyWebhookSignature, receiptNumberFromPI, getStripe } from '../../lib/stripe'
import { getAdminClient } from '../../lib/supabase-admin'

// POST /api/stripe-webhook
//
// Stripe → us. The endpoint:
//   1. Reads the raw body (must NOT JSON.parse first or signature fails).
//   2. Verifies the `stripe-signature` header against STRIPE_WEBHOOK_SECRET.
//   3. Dispatches on event type:
//        - payment_intent.succeeded       → upsert payments row, mark charge paid
//        - payment_intent.payment_failed  → mark charge as 'failed'
//        - setup_intent.succeeded         → upsert tenant_payment_methods row
//   4. Returns 2xx ASAP. Long-running work would be queued — we don't have
//      any yet, all handlers are quick DB upserts.
//
// Idempotency: Stripe retries failed deliveries with the same event id and
// the same PaymentIntent/SetupIntent ids. Every handler checks "does a row
// for this PI/SI id already exist" before inserting.

export const POST: APIRoute = async ({ request }) => {
  const sig = request.headers.get('stripe-signature')
  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = verifyWebhookSignature(rawBody, sig)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid signature'
    console.error('[stripe-webhook] signature verification failed:', msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
        break
      case 'setup_intent.succeeded':
        await handleSetupIntentSucceeded(event.data.object as Stripe.SetupIntent)
        break
      default:
        // Acknowledge but ignore unknown event types.
        console.log('[stripe-webhook] ignoring event type:', event.type)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Handler error'
    console.error('[stripe-webhook] handler failed:', event.type, msg)
    // Return 500 so Stripe retries.
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, received: event.id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const supa = getAdminClient()
  const chargeId = pi.metadata?.charge_id
  const tenantId = pi.metadata?.tenant_id
  if (!chargeId || !tenantId) {
    console.warn('[stripe-webhook] payment_intent.succeeded missing metadata:', pi.id)
    return
  }

  // Idempotency: bail if a payments row for this PI already exists.
  const { data: existing, error: existingErr } = await supa
    .from('payments')
    .select('id')
    .eq('stripe_payment_intent_id', pi.id)
    .maybeSingle()
  if (existingErr) throw existingErr
  if (existing) {
    console.log('[stripe-webhook] payment_intent.succeeded already recorded:', pi.id)
    return
  }

  const method: 'ach' | 'card' = pi.payment_method_types?.[0] === 'card' ? 'card' : 'ach'
  const receipt = receiptNumberFromPI(pi.id)
  const paidAt = new Date((pi.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString()

  const { error: insertErr } = await supa.from('payments').insert({
    tenant_id: tenantId,
    charge_id: chargeId,
    amount_cents: pi.amount_received ?? pi.amount,
    paid_at: paidAt,
    method,
    receipt_number: receipt,
    stripe_payment_intent_id: pi.id,
  })
  if (insertErr) throw insertErr

  const { error: chargeErr } = await supa
    .from('charges')
    .update({ status: 'paid' })
    .eq('id', chargeId)
  if (chargeErr) throw chargeErr
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const supa = getAdminClient()
  const chargeId = pi.metadata?.charge_id
  if (!chargeId) {
    console.warn('[stripe-webhook] payment_intent.payment_failed missing charge_id:', pi.id)
    return
  }
  const { error } = await supa
    .from('charges')
    .update({ status: 'failed' })
    .eq('id', chargeId)
    .eq('stripe_payment_intent_id', pi.id)
  if (error) throw error
}

async function handleSetupIntentSucceeded(si: Stripe.SetupIntent) {
  const supa = getAdminClient()
  const tenantId = si.metadata?.tenant_id
  if (!tenantId) {
    console.warn('[stripe-webhook] setup_intent.succeeded missing tenant_id:', si.id)
    return
  }
  const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method?.id
  const customerId = typeof si.customer === 'string' ? si.customer : si.customer?.id
  if (!pmId || !customerId) {
    console.warn('[stripe-webhook] setup_intent.succeeded missing pm/customer:', si.id)
    return
  }

  // Idempotency: skip if we've already registered this PaymentMethod.
  const { data: existing, error: existingErr } = await supa
    .from('tenant_payment_methods')
    .select('id')
    .eq('stripe_payment_method_id', pmId)
    .maybeSingle()
  if (existingErr) throw existingErr
  if (existing) return

  // Fetch PM details so we can store last4/bank name for display.
  const stripe = getStripe()
  const pm = await stripe.paymentMethods.retrieve(pmId)
  const isCard = pm.type === 'card'
  const last4 = isCard ? (pm.card?.last4 ?? null) : (pm.us_bank_account?.last4 ?? null)
  const brand = isCard ? (pm.card?.brand ?? null) : null
  const bankName = !isCard ? (pm.us_bank_account?.bank_name ?? null) : null

  // First PM for the tenant becomes the default.
  const { count } = await supa
    .from('tenant_payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  const { error: insertErr } = await supa.from('tenant_payment_methods').insert({
    tenant_id: tenantId,
    stripe_customer_id: customerId,
    stripe_payment_method_id: pmId,
    type: pm.type,
    last4,
    brand,
    bank_name: bankName,
    status: 'active',
    is_default: (count ?? 0) === 0,
  })
  if (insertErr) throw insertErr
}
