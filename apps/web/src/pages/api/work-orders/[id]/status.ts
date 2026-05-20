export const prerender = false
import type { APIRoute } from 'astro'
import {
  workOrderFixtures,
  verifyToken,
  WORK_ORDER_STATUSES,
  type WorkOrderStatus,
} from '../../../../lib/vendors'

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[work-orders.${event}]`, fields)
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await request.json()) as Record<string, unknown>
  const form = await request.formData()
  const out: Record<string, unknown> = {}
  for (const key of new Set(Array.from(form.keys()))) out[key] = form.get(key)
  return out
}

async function authorize(request: Request, workOrderId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  // Accept token via Authorization: Bearer or ?token=
  const header = request.headers.get('authorization') || ''
  let token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    const url = new URL(request.url)
    token = url.searchParams.get('token') ?? ''
  }
  if (!token) return { ok: false, status: 401, error: 'Token required' }
  const payload = await verifyToken(token)
  if (!payload || payload.kind !== 'wo' || payload.id !== workOrderId) {
    return { ok: false, status: 401, error: 'Invalid token' }
  }
  return { ok: true }
}

export const PATCH: APIRoute = async ({ request, params }) => {
  const id = params.id ?? ''
  const wo = workOrderFixtures.find((w) => w.id === id)
  if (!wo) return new Response(JSON.stringify({ ok: false, error: 'Not found' }), { status: 404 })

  const auth = await authorize(request, id)
  if (!auth.ok) return new Response(JSON.stringify({ ok: false, error: auth.error }), { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = await readBody(request)
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid body' }), { status: 400 })
  }

  const next = typeof body.status === 'string' ? (body.status as WorkOrderStatus) : null
  if (!next || !WORK_ORDER_STATUSES.includes(next)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid status' }), { status: 400 })
  }

  const nowIso = new Date().toISOString()
  wo.status = next
  if (next === 'in_progress' && !wo.started_at) wo.started_at = nowIso
  if (next === 'completed' && !wo.completed_at) wo.completed_at = nowIso
  if (!wo.acknowledged_at) wo.acknowledged_at = nowIso
  if (typeof body.notes === 'string') wo.notes = body.notes.trim() || wo.notes
  if (typeof body.cost_cents === 'number' && Number.isInteger(body.cost_cents) && body.cost_cents >= 0) {
    wo.cost_cents = body.cost_cents
  }

  log('info', 'status-updated', { work_order_id: id, status: next })
  return new Response(JSON.stringify({ ok: true, work_order: wo }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

// Allow POST as a fallback (some HTML form-driven workflows can't issue PATCH).
export const POST = PATCH
