export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { findTenantById } from '../../../lib/tenant-fixtures'
import { createSetupIntent, findOrCreateCustomer } from '../../../lib/stripe'
import { getAdminClient } from '../../../lib/supabase-admin'

// POST /api/portal/setup-ach
//
// Body: { paymentMethodType?: 'us_bank_account' | 'card' }  (default ACH)
//
// Response shape:
//   { ok: true, clientSecret, setupIntentId, customerId }
//   { ok: false, error }
//
// The frontend uses `clientSecret` with Stripe Elements to collect bank
// credentials (via Plaid Link inside Stripe's hosted flow) and confirm the
// mandate. On confirmation the webhook (`setup_intent.succeeded`) writes a
// `tenant_payment_methods` row.

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'tenant') {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  const tenant = findTenantById(session.tenantId)
  if (!tenant) {
    return json({ ok: false, error: 'Tenant not found' }, 404)
  }

  let body: { paymentMethodType?: 'us_bank_account' | 'card' } = {}
  try {
    if (request.headers.get('content-length') !== '0') {
      body = (await request.json()) as typeof body
    }
  } catch {
    // Empty/invalid body is fine — we default to ACH.
  }
  const paymentMethodType = body.paymentMethodType ?? 'us_bank_account'

  // Look up existing Stripe customer id for this tenant if we have one.
  let existingCustomerId: string | null = null
  try {
    const supa = getAdminClient()
    const { data } = await supa
      .from('tenant_payment_methods')
      .select('stripe_customer_id')
      .eq('tenant_id', tenant.id)
      .limit(1)
      .maybeSingle()
    existingCustomerId = data?.stripe_customer_id ?? null
  } catch (err) {
    // Schema may not be ready yet in degraded mode — fall through to create.
    console.warn('[setup-ach] could not look up existing customer:', err)
  }

  try {
    const customer = await findOrCreateCustomer({
      tenantId: tenant.id,
      email: tenant.email,
      name: tenant.name,
      existingCustomerId,
    })

    const setupIntent = await createSetupIntent({
      customerId: customer.id,
      paymentMethodType,
      tenantId: tenant.id,
    })

    return json({
      ok: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId: customer.id,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown Stripe error'
    console.error('[setup-ach] failed:', msg)
    return json({ ok: false, error: msg }, 500)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
