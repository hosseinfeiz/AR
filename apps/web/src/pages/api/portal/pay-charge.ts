export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { charges, payments } from '../../../lib/tenant-fixtures'
import { createPaymentIntent, receiptNumberFromPI } from '../../../lib/stripe'
import { getAdminClient } from '../../../lib/supabase-admin'

// POST /api/portal/pay-charge
//
// Body: { chargeId: string }
//
// Response shape (preserved from the previous fixture flow so the existing
// frontend keeps working):
//   { ok: true,  payment_id, receipt_number }
//   { ok: false, error }
//
// Real Stripe behaviour:
//   - Look up the tenant's default `tenant_payment_methods` row.
//   - Create a PaymentIntent with `confirm: true, off_session: true`.
//   - For ACH this returns intent.status = 'processing' — the actual
//     `payments` row is written by the webhook on `payment_intent.succeeded`.
//   - We optimistically return the PI's would-be receipt number so the UI
//     can show "Processing — receipt will be available shortly".
//
// Fixture fallback:
//   - If `STRIPE_SECRET_KEY` is not set OR the DB schema isn't ready
//     (degraded mode), we fall back to the previous in-memory fixture
//     mutation. This keeps local/demo working without a Stripe account.

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'tenant') {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  let body: { chargeId?: string }
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const { chargeId } = body
  if (!chargeId) {
    return json({ ok: false, error: 'chargeId required' }, 400)
  }

  // ----- Try DB-backed charge first, fall back to fixture -----
  const fixtureCharge = charges.find((c) => c.id === chargeId)

  // If Stripe isn't configured at all, keep the demo path working.
  if (!process.env.STRIPE_SECRET_KEY) {
    return payViaFixture(fixtureCharge, session.tenantId, chargeId)
  }

  try {
    const supa = getAdminClient()

    const { data: chargeRow, error: chargeErr } = await supa
      .from('charges')
      .select('id, tenant_id, amount_cents, status, description, stripe_payment_intent_id')
      .eq('id', chargeId)
      .maybeSingle()

    if (chargeErr) throw chargeErr

    // If the DB doesn't know this charge, fall back to fixture for demo.
    if (!chargeRow) {
      return payViaFixture(fixtureCharge, session.tenantId, chargeId)
    }

    if (chargeRow.tenant_id !== session.tenantId) {
      return json({ ok: false, error: 'Charge not found' }, 404)
    }
    if (chargeRow.status === 'paid') {
      return json({ ok: false, error: 'Already paid' }, 400)
    }
    if (chargeRow.stripe_payment_intent_id) {
      // Re-use the existing PI rather than double-charging.
      return json({
        ok: true,
        payment_id: chargeRow.stripe_payment_intent_id,
        receipt_number: receiptNumberFromPI(chargeRow.stripe_payment_intent_id),
        processing: true,
      })
    }

    // Find the tenant's default payment method.
    const { data: pm, error: pmErr } = await supa
      .from('tenant_payment_methods')
      .select('stripe_customer_id, stripe_payment_method_id, type, status')
      .eq('tenant_id', session.tenantId)
      .eq('status', 'active')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pmErr) throw pmErr
    if (!pm) {
      return json(
        {
          ok: false,
          error: 'No active payment method on file. Please set up ACH auto-pay first.',
        },
        400,
      )
    }

    const intent = await createPaymentIntent({
      amountCents: chargeRow.amount_cents,
      customerId: pm.stripe_customer_id,
      paymentMethodId: pm.stripe_payment_method_id,
      paymentMethodType: (pm.type === 'card' ? 'card' : 'us_bank_account'),
      tenantId: session.tenantId,
      chargeId: chargeRow.id,
      description: chargeRow.description ?? `Rent payment ${chargeRow.id}`,
    })

    // Stamp PI id on the charge so the webhook can correlate.
    await supa
      .from('charges')
      .update({
        stripe_payment_intent_id: intent.id,
        status: 'processing',
      })
      .eq('id', chargeRow.id)

    return json({
      ok: true,
      payment_id: intent.id,
      receipt_number: receiptNumberFromPI(intent.id),
      processing: intent.status !== 'succeeded',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[pay-charge] failed:', msg)
    return json({ ok: false, error: msg }, 500)
  }
}

// ---------------------------------------------------------------------------
// Fixture fallback (demo / no-Stripe mode)
// ---------------------------------------------------------------------------

function payViaFixture(
  charge: ReturnType<typeof charges.find> | undefined,
  sessionTenantId: string,
  chargeId: string,
): Response {
  if (!charge || charge.tenant_id !== sessionTenantId) {
    return json({ ok: false, error: 'Charge not found' }, 404)
  }
  if (charge.status === 'paid') {
    return json({ ok: false, error: 'Already paid' }, 400)
  }
  const receipt = rcpNumber()
  const paymentId = `pay-mock-${Date.now()}`
  payments.push({
    id: paymentId,
    tenant_id: sessionTenantId,
    charge_id: chargeId,
    amount_cents: charge.amount_cents,
    paid_at: new Date().toISOString(),
    method: 'card',
    receipt_number: receipt,
  })
  charge.status = 'paid'
  charge.paid_payment_id = paymentId
  return json({ ok: true, payment_id: paymentId, receipt_number: receipt })
}

function rcpNumber(): string {
  const a = String(Math.floor(Math.random() * 9000) + 1000)
  const b = String(Math.floor(Math.random() * 9000) + 1000)
  return `RCP-${a}-${b}`
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
