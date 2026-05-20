export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../lib/auth'
import {
  vendorFixtures,
  VENDOR_CATEGORIES,
  type Vendor,
  type VendorCategory,
} from '../../../../lib/vendors'

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[vendors.${event}]`, fields)
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    return (await request.json()) as Record<string, unknown>
  }
  const form = await request.formData()
  const out: Record<string, unknown> = {}
  for (const key of new Set(Array.from(form.keys()))) {
    const all = form.getAll(key)
    out[key] = all.length > 1 ? all : all[0]
  }
  return out
}

function asStr(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

function asStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (typeof v === 'string') return [v]
  return []
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    })
  }

  let body: Record<string, unknown>
  try {
    body = await readBody(request)
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request body' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    })
  }

  const name = asStr(body.name)
  const categoryRaw = asStr(body.category)
  if (!name) return new Response(JSON.stringify({ ok: false, error: 'name required' }), { status: 400 })
  if (!categoryRaw || !VENDOR_CATEGORIES.includes(categoryRaw as VendorCategory)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid category' }), { status: 400 })
  }

  const rating = (() => {
    const r = body.rating
    if (r === '' || r == null) return null
    const num = typeof r === 'number' ? r : parseFloat(String(r))
    if (!isFinite(num) || num < 0 || num > 5) return null
    return Math.round(num * 10) / 10
  })()

  const now = new Date().toISOString()
  const vendor: Vendor = {
    id: `vend-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    category: categoryRaw as VendorCategory,
    contact_name: asStr(body.contact_name),
    email: asStr(body.email),
    phone: asStr(body.phone),
    license_number: asStr(body.license_number),
    insurance_expiry_date: asStr(body.insurance_expiry_date),
    coi_storage_path: asStr(body.coi_storage_path),
    rating,
    building_ids: asStrArr(body.building_ids),
    active: body.active === 'true' || body.active === true,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }

  vendorFixtures.push(vendor)
  log('info', 'create', { vendor_id: vendor.id, category: vendor.category })

  if ((request.headers.get('accept') || '').includes('application/json')) {
    return new Response(JSON.stringify({ ok: true, id: vendor.id }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  return redirect(`/admin/vendors/${vendor.id}`, 303)
}
