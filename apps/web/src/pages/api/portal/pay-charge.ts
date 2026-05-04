export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { charges, payments } from '../../../lib/tenant-fixtures'

function rcpNumber(): string {
  const a = String(Math.floor(Math.random() * 9000) + 1000)
  const b = String(Math.floor(Math.random() * 9000) + 1000)
  return `RCP-${a}-${b}`
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'tenant') {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  let body: { chargeId?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const { chargeId } = body
  if (!chargeId) {
    return new Response(JSON.stringify({ ok: false, error: 'chargeId required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const charge = charges.find((c) => c.id === chargeId)
  if (!charge || charge.tenant_id !== session.tenantId) {
    return new Response(JSON.stringify({ ok: false, error: 'Charge not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (charge.status === 'paid') {
    return new Response(JSON.stringify({ ok: false, error: 'Already paid' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const receipt = rcpNumber()
  const paymentId = `pay-mock-${Date.now()}`

  // In-memory mutation
  payments.push({
    id: paymentId,
    tenant_id: session.tenantId,
    charge_id: chargeId,
    amount_cents: charge.amount_cents,
    paid_at: new Date().toISOString(),
    method: 'card',
    receipt_number: receipt,
  })

  charge.status = 'paid'
  charge.paid_payment_id = paymentId

  return new Response(JSON.stringify({ ok: true, receipt_number: receipt }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
