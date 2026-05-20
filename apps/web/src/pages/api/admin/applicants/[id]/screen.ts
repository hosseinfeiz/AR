export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../../lib/auth'
import {
  getApplicant,
  updateApplicantFields,
  transitionStatus,
  canTransition,
} from '../../../../../lib/applicants'
import { runScreening } from '../../../../../lib/screening'

function bad(error: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status, headers: { 'content-type': 'application/json' },
  })
}

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

export const POST: APIRoute = async ({ cookies, params, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') return bad('Forbidden', 403)

  const id = params.id
  if (!id) return bad('Missing applicant id')

  const applicant = await getApplicant(id)
  if (!applicant) return bad('Applicant not found', 404)

  if (applicant.status !== 'application' && applicant.status !== 'screening') {
    return bad(`Cannot screen an applicant in status "${applicant.status}"`, 409)
  }

  const env = envFor(locals)
  const result = await runScreening({
    applicant_id: applicant.id,
    name: applicant.name,
    email: applicant.email,
    monthly_income_cents: applicant.monthly_income_cents,
  }, env)

  await updateApplicantFields(id, {
    screening_provider_ref: result.provider_ref,
    screening_score: result.score,
    screening_recommendation: result.recommendation,
  })

  // Auto-advance status: if we were in 'application' and got a result, move to 'screening'.
  let updated = await getApplicant(id)
  if (updated && updated.status === 'application' && canTransition('application', 'screening')) {
    updated = await transitionStatus(id, 'screening')
  }

  // eslint-disable-next-line no-console
  console.log('[applicants:screen]', {
    id, mock: result.mock, score: result.score, recommendation: result.recommendation,
  })

  return new Response(JSON.stringify({ ok: true, screening: result, applicant: updated }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}
