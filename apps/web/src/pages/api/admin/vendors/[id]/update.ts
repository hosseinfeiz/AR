export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../../lib/auth'
import {
  vendorFixtures,
  VENDOR_CATEGORIES,
  type VendorCategory,
} from '../../../../../lib/vendors'

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[vendors.${event}]`, fields)
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('content-type') || ''
  if (ct.includes('application/json')) return (await request.json()) as Record<string, unknown>
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
  const t = v.trim()
  return t === '' ? null : t
}

function asStrArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (typeof v === 'string') return [v]
  return []
}

export const POST: APIRoute = async ({ request, cookies, params, redirect }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), { status: 403 })
  }
  const id = params.id ?? ''
  const idx = vendorFixtures.findIndex((v) => v.id === id)
  if (idx < 0) return new Response(JSON.stringify({ ok: false, error: 'Not found' }), { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await readBody(request)
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request body' }), { status: 400 })
  }

  const existing = vendorFixtures[idx]!
  const category = asStr(body.category)
  if (category && !VENDOR_CATEGORIES.includes(category as VendorCategory)) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid category' }), { status: 400 })
  }

  const rating = (() => {
    const r = body.rating
    if (r === '' || r == null) return existing.rating
    const num = typeof r === 'number' ? r : parseFloat(String(r))
    if (!isFinite(num) || num < 0 || num > 5) return existing.rating
    return Math.round(num * 10) / 10
  })()

  vendorFixtures[idx] = {
    ...existing,
    name: asStr(body.name) ?? existing.name,
    category: (category as VendorCategory) ?? existing.category,
    contact_name: body.contact_name === undefined ? existing.contact_name : asStr(body.contact_name),
    email: body.email === undefined ? existing.email : asStr(body.email),
    phone: body.phone === undefined ? existing.phone : asStr(body.phone),
    license_number: body.license_number === undefined ? existing.license_number : asStr(body.license_number),
    insurance_expiry_date: body.insurance_expiry_date === undefined ? existing.insurance_expiry_date : asStr(body.insurance_expiry_date),
    coi_storage_path: body.coi_storage_path === undefined ? existing.coi_storage_path : asStr(body.coi_storage_path),
    rating,
    building_ids: body.building_ids === undefined ? existing.building_ids : asStrArr(body.building_ids),
    active: body.active === undefined ? existing.active : (body.active === 'true' || body.active === true),
    updated_at: new Date().toISOString(),
  }
  log('info', 'update', { vendor_id: id })

  if ((request.headers.get('accept') || '').includes('application/json')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  return redirect(`/admin/vendors/${id}`, 303)
}
