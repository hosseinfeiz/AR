export const prerender = false
import { z } from '@ar/shared'
import { getSession } from '../../../lib/auth'
import { charges, payments } from '../../../lib/tenant-fixtures'
import { apiHandler, badRequest, notFound, ok, respond, unauthorized } from '../../../lib/api-handler'
import { createPaymentIntent, receiptNumberFromPI } from '../../../lib/stripe'
import { getAdminClient } from '../../../lib/supabase-admin'

const PayChargeInputSchema = z.object({
  chargeId: z.string().min(1, 'chargeId required'),
})

// POST /api/portal/pay-charge
//
// Body: { chargeId: string }
//
// Response shape (preserved from the previous fixture flow so the existing
// frontend keeps working):
//   { ok: true,  payment_id?, receipt_number, processing?: true }
//   { ok: false, error, code }
//
// Real Stripe behaviour (S1):
//   - Look up the tenant's default `tenant_payment_methods` row.
//   - Create a PaymentIntent with `confirm: true, off_session: true`.
//   - For ACH this returns intent.status = 'processing' — the actual
//     `payments` row is written by the webhook on `payment_intent.succeeded`.
//
// Fixture fallback:
//   - If `STRIPE_SECRET_KEY` is not set OR the DB doesn't know the charge id,
//     we fall back to the previous in-memory fixture mutation.

function rcpNumber(): string {
  const a = String(Math.floor(Math.random() * 9000) + 1000)
  const b = String(Math.floor(Math.random() * 9000) + 1000)
  return `RCP-${a}-${b}`
}

function payViaFixture(
  charge: ReturnType<typeof charges.find>,
  sessionTenantId: string,
  chargeId: string,
): Response {
  if (!charge || charge.tenant_id !== sessionTenantId) {
    return notFound('Charge not found')
  }
  if (charge.status === 'paid') {
    return badRequest('Already paid', 'ALREADY_PAID')
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
  return ok({ ok: true, payment_id: paymentId, receipt_number: receipt })
}

export const POST = apiHandler(PayChargeInputSchema, async (data, { cookies, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'tenant') return unauthorized()

  const fixtureCharge = charges.find((c) => c.id === data.chargeId)

  // No Stripe configured → demo path
  if (!process.env.STRIPE_SECRET_KEY) {
    return payViaFixture(fixtureCharge, session.tenantId, data.chargeId)
  }

  try {
    const supa = getAdminClient()

    const { data: chargeRow, error: chargeErr } = await supa
      .from('charges')
      .select('id, tenant_id, amount_cents, status, description, stripe_payment_intent_id')
      .eq('id', data.chargeId)
      .maybeSingle()

    if (chargeErr) throw chargeErr

    // If the DB doesn't know this charge, fall back to fixture (demo mode).
    if (!chargeRow) {
      return payViaFixture(fixtureCharge, session.tenantId, data.chargeId)
    }

    if (chargeRow.tenant_id !== session.tenantId) return notFound('Charge not found')
    if (chargeRow.status === 'paid') return badRequest('Already paid', 'ALREADY_PAID')

    if (chargeRow.stripe_payment_intent_id) {
      // Already kicked off — don't double-charge; return the existing PI info.
      return ok({
        ok: true,
        payment_id: chargeRow.stripe_payment_intent_id,
        receipt_number: receiptNumberFromPI(chargeRow.stripe_payment_intent_id),
        processing: true,
      })
    }

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
      return badRequest(
        'No active payment method on file. Please set up ACH auto-pay first.',
        'NO_PAYMENT_METHOD',
      )
    }

    const intent = await createPaymentIntent({
      amountCents: chargeRow.amount_cents,
      customerId: pm.stripe_customer_id,
      paymentMethodId: pm.stripe_payment_method_id,
      paymentMethodType: pm.type === 'card' ? 'card' : 'us_bank_account',
      tenantId: session.tenantId,
      chargeId: chargeRow.id,
      description: chargeRow.description ?? `Rent payment ${chargeRow.id}`,
    })

    await supa
      .from('charges')
      .update({ stripe_payment_intent_id: intent.id, status: 'processing' })
      .eq('id', chargeRow.id)

    return ok({
      ok: true,
      payment_id: intent.id,
      receipt_number: receiptNumberFromPI(intent.id),
      processing: intent.status !== 'succeeded',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    locals.log.error('pay-charge: stripe path failed', err, { chargeId: data.chargeId })
    return respond({ ok: false, error: msg, code: 'STRIPE_ERROR' }, 500)
  }
})
