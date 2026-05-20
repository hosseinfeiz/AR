export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../../lib/auth'
import { tenantRequests } from '../../../../../lib/tenant-fixtures'

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[acknowledge.${event}]`, fields)
}

export const POST: APIRoute = async ({ cookies, params, request, redirect }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 })
  }
  const id = params.id ?? ''
  const req = tenantRequests.find((r) => r.id === id)
  if (!req) return new Response(JSON.stringify({ ok: false, error: 'Not found' }), { status: 404 })

  const nowIso = new Date().toISOString()
  ;(req as { acknowledged_at?: string }).acknowledged_at = nowIso
  if (req.status === 'new') req.status = 'acknowledged'
  req.updated_at = nowIso
  log('info', 'acknowledged', { request_id: id })

  if ((request.headers.get('accept') || '').includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, acknowledged_at: nowIso }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  return redirect('/admin/maintenance', 303)
}
