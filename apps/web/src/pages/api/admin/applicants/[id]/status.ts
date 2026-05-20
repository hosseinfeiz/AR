export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../../lib/auth'
import { transitionStatus, StatusTransitionError, type ApplicantStatus } from '../../../../../lib/applicants'

const VALID_STATUS: ApplicantStatus[] = [
  'inquiry', 'application', 'screening', 'lease_ready', 'signed', 'withdrawn',
]

function bad(error: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status, headers: { 'content-type': 'application/json' },
  })
}

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') return bad('Forbidden', 403)

  const id = params.id
  if (!id || typeof id !== 'string') return bad('Missing applicant id')

  let body: { status?: unknown }
  try {
    body = (await request.json()) as { status?: unknown }
  } catch {
    return bad('Invalid JSON')
  }

  const to = body.status
  if (typeof to !== 'string' || !VALID_STATUS.includes(to as ApplicantStatus)) {
    return bad('status must be one of: ' + VALID_STATUS.join(', '))
  }

  try {
    const updated = await transitionStatus(id, to as ApplicantStatus)
    // eslint-disable-next-line no-console
    console.log('[applicants:status]', { id, to, applicant_status: updated.status })
    return new Response(JSON.stringify({ ok: true, applicant: updated }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    if (e instanceof StatusTransitionError) {
      return bad(e.message, 409)
    }
    if ((e as Error).message?.includes('not found')) return bad((e as Error).message, 404)
    // eslint-disable-next-line no-console
    console.error('[applicants:status] failed', e)
    return bad((e as Error).message, 500)
  }
}
