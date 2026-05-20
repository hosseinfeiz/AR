export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../../lib/auth'
import { tenantRequests } from '../../../../../lib/tenant-fixtures'
import {
  vendorFixtures,
  workOrderFixtures,
  signToken,
  WORK_ORDER_STATUSES,
  type WorkOrderStatus,
} from '../../../../../lib/vendors'

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[dispatch.${event}]`, fields)
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await request.json()) as Record<string, unknown>
  const form = await request.formData()
  const out: Record<string, unknown> = {}
  for (const key of new Set(Array.from(form.keys()))) {
    out[key] = form.get(key)
  }
  return out
}

// S4 may not have merged yet — shim sendSms so this route still works.
// Use an opaque runtime path so Rollup doesn't try to statically resolve it
// when lib/twilio.ts is absent.
async function getSendSms(): Promise<(args: { to: string; body: string }) => Promise<void>> {
  try {
    const path = ['..', '..', '..', '..', '..', 'lib', 'twilio.ts'].join('/')
    /* @vite-ignore */
    const mod = (await import(/* @vite-ignore */ path)) as { sendSms?: (args: { to: string; body: string }) => Promise<void> }
    if (mod && typeof mod.sendSms === 'function') return mod.sendSms
  } catch {
    // swallow — fall through to no-op
  }
  return async (args: { to: string; body: string }) => {
    log('info', 'twilio.no-op', { to: args.to, body_preview: args.body.slice(0, 80) })
  }
}

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 })
  }
  const id = params.id ?? ''
  const req = tenantRequests.find((r) => r.id === id)
  if (!req) return new Response(JSON.stringify({ ok: false, error: 'Request not found' }), { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await readBody(request)
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid body' }), { status: 400 })
  }

  const vendorId = typeof body.vendor_id === 'string' ? body.vendor_id : ''
  const vendor = vendorFixtures.find((v) => v.id === vendorId)
  if (!vendor) return new Response(JSON.stringify({ ok: false, error: 'Vendor not found' }), { status: 400 })

  const statusRaw = typeof body.status === 'string' ? body.status : 'scheduled'
  const status: WorkOrderStatus = WORK_ORDER_STATUSES.includes(statusRaw as WorkOrderStatus)
    ? (statusRaw as WorkOrderStatus)
    : 'scheduled'

  const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

  const woId = `wo-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const token = await signToken({ kind: 'wo', id: woId, iat: Math.floor(Date.now() / 1000) })
  const nowIso = new Date().toISOString()

  workOrderFixtures.push({
    id: woId,
    maintenance_request_id: req.id,
    vendor_id: vendor.id,
    status,
    assigned_at: nowIso,
    acknowledged_at: null,
    started_at: null,
    completed_at: null,
    cost_cents: null,
    notes,
    photo_paths: [],
    vendor_token: token,
  })

  // Annotate the parent request with SLA timestamps
  req.updated_at = nowIso
  // mutate-in-place tenant request: tenantRequests uses partial shape — assign via cast
  ;(req as { vendor_assigned_at?: string }).vendor_assigned_at = nowIso

  const sendSms = await getSendSms()
  const portalUrl = `/vendor/${token}`
  const smsBody = `[A&R] New ${req.urgency} maintenance dispatch ${req.ref_id} at ${req.unit_label}. View: ${portalUrl}`
  if (vendor.phone) {
    try { await sendSms({ to: vendor.phone, body: smsBody }) } catch (e) {
      log('warn', 'sms.failed', { vendor_id: vendor.id, error: (e as Error).message })
    }
  } else {
    log('info', 'sms.skipped-no-phone', { vendor_id: vendor.id })
  }

  log('info', 'dispatched', { work_order_id: woId, vendor_id: vendor.id, request_id: req.id, urgency: req.urgency })

  if ((request.headers.get('accept') || '').includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, work_order_id: woId, vendor_token: token }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  return redirect('/admin/maintenance', 303)
}
