export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../../lib/auth'
import {
  getApplicant,
  updateApplicantFields,
  transitionStatus,
  canTransition,
} from '../../../../../lib/applicants'
import { sendForSignature } from '../../../../../lib/esign'
import { renderLeasePdf } from '../../../../../lib/lease-pdf'
import { buildings, units } from '../../../../../lib/fixtures'

function bad(error: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status, headers: { 'content-type': 'application/json' },
  })
}

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

function addOneYear(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export const POST: APIRoute = async ({ cookies, params, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') return bad('Forbidden', 403)

  const id = params.id
  if (!id) return bad('Missing applicant id')

  const applicant = await getApplicant(id)
  if (!applicant) return bad('Applicant not found', 404)

  if (applicant.status !== 'screening') {
    return bad(`Lease can only be sent from "screening"; applicant is "${applicant.status}"`, 409)
  }
  if (applicant.screening_recommendation !== 'accept') {
    return bad('Screening recommendation must be "accept" before sending a lease', 409)
  }

  const building = buildings.find((b) => b.id === applicant.building_id)
  const unit = applicant.unit_id ? units.find((u) => u.id === applicant.unit_id) : null
  if (!building) return bad('Applicant has no valid building', 400)

  const monthlyRent = unit?.monthly_rent_cents ?? 0
  const securityDeposit = monthlyRent // 1x rent — matches Section 504B.178 of the MN landlord-tenant code's spirit
  const leaseStart = applicant.move_in_date ?? new Date().toISOString().slice(0, 10)
  const leaseEnd = addOneYear(leaseStart)

  const pdf = await renderLeasePdf({
    applicant_name: applicant.name,
    applicant_email: applicant.email,
    building_name: building.name,
    building_address: `${building.address_line1}, ${building.city}, ${building.state} ${building.postal_code}`,
    unit_label: unit ? `${building.name} #${unit.unit_number}` : '(unit TBD)',
    monthly_rent_cents: monthlyRent,
    security_deposit_cents: securityDeposit,
    lease_start: leaseStart,
    lease_end: leaseEnd,
  })

  const env = envFor(locals)
  const envelope = await sendForSignature({
    applicant_id: applicant.id,
    applicant_name: applicant.name,
    applicant_email: applicant.email,
    pdf,
    subject: `Lease — ${building.name} ${unit ? '#' + unit.unit_number : ''}`,
    message: `Hi ${applicant.name.split(' ')[0] ?? applicant.name}, your lease is ready to sign.`,
  }, env)

  await updateApplicantFields(id, { esign_envelope_id: envelope.envelope_id })

  let updated = await getApplicant(id)
  if (updated && canTransition(updated.status, 'lease_ready')) {
    updated = await transitionStatus(id, 'lease_ready')
  }

  // eslint-disable-next-line no-console
  console.log('[applicants:send-lease]', {
    id, mock: envelope.mock, envelope_id: envelope.envelope_id,
  })

  return new Response(JSON.stringify({
    ok: true,
    envelope_id: envelope.envelope_id,
    signing_url: envelope.signing_url,
    mock: envelope.mock,
    applicant: updated,
  }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}
