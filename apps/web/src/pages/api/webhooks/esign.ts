// E-signature webhook receiver.
//
// Triggered by Dropbox Sign when an envelope is fully signed (or by our own
// admin UI in mock mode via the "Simulate signed" button). On signature:
//
//   1. Find the applicant by envelope_id (or applicant_id metadata)
//   2. Transition status: lease_ready → signed
//   3. Best-effort: write a leases row (signed_at, signed_pdf_path),
//      create a tenants row, and an initial first-month rent charge.
//
// Steps 1+2 always succeed in-memory; step 3 may no-op when the F1 schema is
// not yet present (leases / tenants / charges tables don't exist in the
// migrations owned by S2). The route returns 200 regardless so the provider
// doesn't retry.

export const prerender = false
import type { APIRoute } from 'astro'
import {
  getApplicant,
  transitionStatus,
  canTransition,
  listApplicants,
} from '../../../lib/applicants'
import { parseWebhookEvent } from '../../../lib/esign'
import { getAdminClient } from '../../../lib/supabase-admin'
import { units } from '../../../lib/fixtures'

function res(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

function addMonths(iso: string, n: number): string {
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00Z') : new Date(iso)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

function endOfMonthAfter(iso: string): string {
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00Z') : new Date(iso)
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function hasSupabaseEnv(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
}

/**
 * Best-effort writes into the F1-owned tenant/lease/charge tables.
 * Any failure is logged but doesn't fail the webhook.
 */
async function provisionTenant(args: {
  applicant_id: string
  applicant_name: string
  applicant_email: string
  applicant_phone: string | null
  building_id: string
  unit_id: string | null
  monthly_rent_cents: number
  security_deposit_cents: number
  lease_start: string
  lease_end: string
  signed_pdf_path: string
}) {
  if (!hasSupabaseEnv()) return { written: false, reason: 'no-supabase-env' }
  try {
    const c = getAdminClient()

    const { data: tenant, error: tErr } = await c.from('tenants').insert({
      name: args.applicant_name,
      email: args.applicant_email,
      phone: args.applicant_phone,
      building_id: args.building_id,
      unit_id: args.unit_id,
      move_in_date: args.lease_start,
    }).select('id').single()
    if (tErr) throw tErr

    const { data: lease, error: lErr } = await c.from('leases').insert({
      tenant_id: tenant!.id,
      unit_id: args.unit_id,
      start_date: args.lease_start,
      end_date: args.lease_end,
      monthly_rent_cents: args.monthly_rent_cents,
      security_deposit_cents: args.security_deposit_cents,
      status: 'active',
      signed_at: new Date().toISOString(),
      signed_pdf_path: args.signed_pdf_path,
    }).select('id').single()
    if (lErr) throw lErr

    const { error: cErr } = await c.from('charges').insert({
      lease_id: lease!.id,
      tenant_id: tenant!.id,
      description: `Monthly rent — first month`,
      amount_cents: args.monthly_rent_cents,
      due_date: args.lease_start,
      status: 'due',
    })
    if (cErr) throw cErr

    return { written: true, tenant_id: tenant!.id, lease_id: lease!.id }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[webhooks/esign] provisionTenant failed (degraded ok)', (e as Error).message)
    return { written: false, reason: (e as Error).message }
  }
}

export const POST: APIRoute = async ({ request }) => {
  let raw: unknown
  const ctype = request.headers.get('content-type') ?? ''
  try {
    if (ctype.includes('application/json')) {
      raw = await request.json()
    } else {
      // Dropbox Sign sends form-encoded body with a `json` field
      const form = await request.formData()
      const j = form.get('json')
      if (typeof j === 'string') {
        try { raw = JSON.parse(j) } catch { raw = null }
      } else {
        raw = null
      }
    }
  } catch {
    return res({ ok: false, error: 'Invalid body' }, 400)
  }

  const event = parseWebhookEvent(raw)
  if (!event) return res({ ok: false, error: 'Unrecognized webhook payload' }, 400)

  // Look up applicant: prefer explicit metadata, fall back to envelope id.
  let applicant = event.applicant_id ? await getApplicant(event.applicant_id) : null
  if (!applicant) {
    const all = await listApplicants()
    applicant = all.find((a) => a.esign_envelope_id === event.envelope_id) ?? null
  }
  if (!applicant) {
    // eslint-disable-next-line no-console
    console.warn('[webhooks/esign] no applicant for envelope', event.envelope_id)
    return res({ ok: true, ignored: true, reason: 'no-matching-applicant' })
  }

  // Treat declined as transition to withdrawn, signed as transition to signed.
  if (event.event_type === 'signature_request_declined') {
    if (canTransition(applicant.status, 'withdrawn')) {
      await transitionStatus(applicant.id, 'withdrawn')
    }
    // eslint-disable-next-line no-console
    console.log('[webhooks/esign] declined', { applicant_id: applicant.id })
    return res({ ok: true, action: 'declined' })
  }

  // For "signed" events:
  if (canTransition(applicant.status, 'signed')) {
    await transitionStatus(applicant.id, 'signed')
  }

  // Compute lease parameters
  const unit = applicant.unit_id ? units.find((u) => u.id === applicant!.unit_id) : null
  const monthlyRent = unit?.monthly_rent_cents ?? 0
  const securityDeposit = monthlyRent
  const leaseStart = applicant.move_in_date ?? new Date().toISOString().slice(0, 10)
  const leaseEnd = endOfMonthAfter(leaseStart)

  const signedPdfPath = `leases/${applicant.id}/${event.envelope_id}.pdf`

  const result = await provisionTenant({
    applicant_id: applicant.id,
    applicant_name: applicant.name,
    applicant_email: applicant.email,
    applicant_phone: applicant.phone,
    building_id: applicant.building_id,
    unit_id: applicant.unit_id,
    monthly_rent_cents: monthlyRent,
    security_deposit_cents: securityDeposit,
    lease_start: leaseStart,
    lease_end: leaseEnd,
    signed_pdf_path: signedPdfPath,
  })

  // eslint-disable-next-line no-console
  console.log('[webhooks/esign] signed', {
    applicant_id: applicant.id,
    envelope_id: event.envelope_id,
    next_month: addMonths(leaseStart, 1),
    provisioned: result.written,
    reason: result.written ? undefined : result.reason,
  })

  return res({ ok: true, action: 'signed', provisioned: result })
}
