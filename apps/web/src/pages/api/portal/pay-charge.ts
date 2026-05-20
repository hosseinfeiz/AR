export const prerender = false
import { z } from '@ar/shared'
import { getSession } from '../../../lib/auth'
import { charges, payments } from '../../../lib/tenant-fixtures'
import { apiHandler, badRequest, notFound, ok, unauthorized } from '../../../lib/api-handler'

const PayChargeInputSchema = z.object({
  chargeId: z.string().min(1, 'chargeId required'),
})

function rcpNumber(): string {
  const a = String(Math.floor(Math.random() * 9000) + 1000)
  const b = String(Math.floor(Math.random() * 9000) + 1000)
  return `RCP-${a}-${b}`
}

export const POST = apiHandler(PayChargeInputSchema, (data, { cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'tenant') {
    return unauthorized()
  }

  const charge = charges.find((c) => c.id === data.chargeId)
  if (!charge || charge.tenant_id !== session.tenantId) {
    return notFound('Charge not found')
  }

  if (charge.status === 'paid') {
    return badRequest('Already paid', 'ALREADY_PAID')
  }

  const receipt = rcpNumber()
  const paymentId = `pay-mock-${Date.now()}`

  // In-memory mutation
  payments.push({
    id: paymentId,
    tenant_id: session.tenantId,
    charge_id: data.chargeId,
    amount_cents: charge.amount_cents,
    paid_at: new Date().toISOString(),
    method: 'card',
    receipt_number: receipt,
  })

  charge.status = 'paid'
  charge.paid_payment_id = paymentId

  return ok({ ok: true, receipt_number: receipt })
})
