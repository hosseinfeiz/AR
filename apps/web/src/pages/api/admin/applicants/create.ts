export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../lib/auth'
import { createApplicant, type ApplicantStatus } from '../../../../lib/applicants'

const VALID_BUILDINGS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
]

const VALID_STATUS: ApplicantStatus[] = [
  'inquiry', 'application', 'screening', 'lease_ready', 'signed', 'withdrawn',
]

function bad(error: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status, headers: { 'content-type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return bad('Forbidden', 403)
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return bad('Invalid JSON')
  }

  const {
    name,
    email,
    phone,
    building_id,
    unit_id,
    move_in_date,
    monthly_income_cents,
    status,
  } = body

  if (typeof name !== 'string' || name.trim() === '') return bad('name is required')
  if (typeof email !== 'string' || !/.+@.+/.test(email)) return bad('valid email is required')
  if (typeof building_id !== 'string' || !VALID_BUILDINGS.includes(building_id)) {
    return bad('Invalid building_id')
  }
  if (phone != null && typeof phone !== 'string') return bad('phone must be a string')
  if (unit_id != null && typeof unit_id !== 'string') return bad('unit_id must be a string')
  if (move_in_date != null && (typeof move_in_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(move_in_date))) {
    return bad('move_in_date must be YYYY-MM-DD')
  }
  if (
    monthly_income_cents != null &&
    (typeof monthly_income_cents !== 'number' || !Number.isInteger(monthly_income_cents) || monthly_income_cents < 0)
  ) {
    return bad('monthly_income_cents must be a non-negative integer')
  }
  if (status != null && (typeof status !== 'string' || !VALID_STATUS.includes(status as ApplicantStatus))) {
    return bad('Invalid status')
  }

  try {
    const created = await createApplicant({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: typeof phone === 'string' ? phone.trim() || null : null,
      building_id,
      unit_id: typeof unit_id === 'string' ? unit_id : null,
      move_in_date: typeof move_in_date === 'string' ? move_in_date : null,
      monthly_income_cents: typeof monthly_income_cents === 'number' ? monthly_income_cents : null,
      status: typeof status === 'string' ? (status as ApplicantStatus) : 'inquiry',
    })
    // eslint-disable-next-line no-console
    console.log('[applicants:create]', { id: created.id, email: created.email, status: created.status })
    return new Response(JSON.stringify({ ok: true, applicant: created }), {
      status: 201, headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[applicants:create] failed', e)
    return bad((e as Error).message, 500)
  }
}
