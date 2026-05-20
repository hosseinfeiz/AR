export const prerender = false
import type { APIRoute } from 'astro'
import {
  surveyFixtures,
  verifyToken,
  getSurveyForRequest,
} from '../../../../lib/vendors'
import { tenantRequests } from '../../../../lib/tenant-fixtures'

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[survey.${event}]`, fields)
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await request.json()) as Record<string, unknown>
  const form = await request.formData()
  const out: Record<string, unknown> = {}
  for (const key of new Set(Array.from(form.keys()))) out[key] = form.get(key)
  return out
}

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const token = params.token ?? ''
  const payload = await verifyToken(token)
  if (!payload || payload.kind !== 'sv') {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), { status: 401 })
  }
  const req = tenantRequests.find((r) => r.id === payload.id)
  if (!req) return new Response(JSON.stringify({ ok: false, error: 'Request not found' }), { status: 404 })

  if (getSurveyForRequest(req.id)) {
    return new Response(JSON.stringify({ ok: false, error: 'Already submitted' }), { status: 409 })
  }

  let body: Record<string, unknown>
  try {
    body = await readBody(request)
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid body' }), { status: 400 })
  }

  const ratingRaw = body.rating
  const rating = typeof ratingRaw === 'number' ? ratingRaw : parseInt(String(ratingRaw ?? ''), 10)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return new Response(JSON.stringify({ ok: false, error: 'rating 1..5 required' }), { status: 400 })
  }
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() || null : null

  surveyFixtures.push({
    id: `srv-new-${Date.now().toString(36)}`,
    request_id: req.id,
    rating,
    feedback,
    submitted_at: new Date().toISOString(),
  })

  log('info', 'submitted', { request_id: req.id, rating })

  if ((request.headers.get('accept') || '').includes('application/json')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  return redirect(`/maintenance-survey/${encodeURIComponent(token)}`, 303)
}
