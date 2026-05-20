// Vendor + work-order data layer.
//
// Mock-mode by default — fixtures live below so S6 pages render with no DB.
// When the schema is reachable the Supabase paths take over (mirrors the
// fallback pattern used in lib/data.ts).

import { supabase } from './supabase'
import { isMockMode } from './fixtures'

export type VendorCategory =
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'appliance'
  | 'pest'
  | 'locks'
  | 'general'

export const VENDOR_CATEGORIES: VendorCategory[] = [
  'plumbing', 'electrical', 'hvac', 'appliance', 'pest', 'locks', 'general',
]

export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  plumbing:   'Plumbing',
  electrical: 'Electrical',
  hvac:       'HVAC',
  appliance:  'Appliance',
  pest:       'Pest control',
  locks:      'Locksmith',
  general:    'General handyman',
}

export interface Vendor {
  id: string
  name: string
  category: VendorCategory
  contact_name: string | null
  email: string | null
  phone: string | null
  license_number: string | null
  insurance_expiry_date: string | null // ISO date
  coi_storage_path: string | null
  rating: number | null
  building_ids: string[]
  active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type WorkOrderStatus =
  | 'quoted'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'billed'

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'quoted', 'scheduled', 'in_progress', 'completed', 'billed',
]

export interface WorkOrder {
  id: string
  maintenance_request_id: string
  vendor_id: string
  status: WorkOrderStatus
  assigned_at: string
  acknowledged_at: string | null
  started_at: string | null
  completed_at: string | null
  cost_cents: number | null
  notes: string | null
  photo_paths: string[]
  vendor_token: string | null
}

export interface Survey {
  id: string
  request_id: string
  rating: number
  feedback: string | null
  submitted_at: string
}

// ---------------------------------------------------------------------------
// Fixtures (mock mode)
// ---------------------------------------------------------------------------

export const vendorFixtures: Vendor[] = [
  {
    id: 'vend-0001-0000-0000-000000000001',
    name: 'Twin Cities Plumbing Co.',
    category: 'plumbing',
    contact_name: 'Mike Halvorson',
    email: 'dispatch@tcplumbing.example',
    phone: '(612) 555-0310',
    license_number: 'MN-PL-44119',
    insurance_expiry_date: '2026-11-15',
    coi_storage_path: 'vendor-coi/tcplumbing-2026.pdf',
    rating: 4.7,
    building_ids: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
    active: true,
    created_at: '2025-08-12T15:00:00Z',
    updated_at: '2025-08-12T15:00:00Z',
    deleted_at: null,
  },
  {
    id: 'vend-0002-0000-0000-000000000002',
    name: 'Bright Spark Electric',
    category: 'electrical',
    contact_name: 'Renee Park',
    email: 'service@brightspark.example',
    phone: '(612) 555-0411',
    license_number: 'MN-EL-22987',
    insurance_expiry_date: '2026-06-30',
    coi_storage_path: 'vendor-coi/brightspark-2026.pdf',
    rating: 4.5,
    building_ids: ['11111111-1111-1111-1111-111111111111'],
    active: true,
    created_at: '2025-08-12T15:05:00Z',
    updated_at: '2025-08-12T15:05:00Z',
    deleted_at: null,
  },
  {
    id: 'vend-0003-0000-0000-000000000003',
    name: 'North Star HVAC',
    category: 'hvac',
    contact_name: 'Jamal Greene',
    email: 'office@northstarhvac.example',
    phone: '(612) 555-0512',
    license_number: 'MN-HV-88421',
    insurance_expiry_date: '2026-05-20', // EXPIRES SOON — surfaces COI warning
    coi_storage_path: 'vendor-coi/northstarhvac-2025.pdf',
    rating: 4.2,
    building_ids: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
    active: true,
    created_at: '2025-09-01T10:00:00Z',
    updated_at: '2025-09-01T10:00:00Z',
    deleted_at: null,
  },
  {
    id: 'vend-0004-0000-0000-000000000004',
    name: 'KleenCo Appliance Repair',
    category: 'appliance',
    contact_name: 'Sandy Liu',
    email: 'help@kleenco.example',
    phone: '(612) 555-0614',
    license_number: null,
    insurance_expiry_date: '2027-01-10',
    coi_storage_path: null,
    rating: 4.0,
    building_ids: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
    active: true,
    created_at: '2025-10-04T12:00:00Z',
    updated_at: '2025-10-04T12:00:00Z',
    deleted_at: null,
  },
  {
    id: 'vend-0005-0000-0000-000000000005',
    name: 'PestStop Twin Cities',
    category: 'pest',
    contact_name: 'Eric Ramos',
    email: 'book@peststop.example',
    phone: '(612) 555-0717',
    license_number: 'MN-PC-10044',
    insurance_expiry_date: '2026-09-01',
    coi_storage_path: 'vendor-coi/peststop-2026.pdf',
    rating: 4.6,
    building_ids: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
    active: true,
    created_at: '2025-08-20T09:00:00Z',
    updated_at: '2025-08-20T09:00:00Z',
    deleted_at: null,
  },
  {
    id: 'vend-0006-0000-0000-000000000006',
    name: 'Keystone Locksmiths',
    category: 'locks',
    contact_name: 'Pat Murray',
    email: 'pat@keystonelocks.example',
    phone: '(612) 555-0819',
    license_number: null,
    insurance_expiry_date: null, // no COI on file — surfaces warning
    coi_storage_path: null,
    rating: 4.3,
    building_ids: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
    active: true,
    created_at: '2025-11-08T10:30:00Z',
    updated_at: '2025-11-08T10:30:00Z',
    deleted_at: null,
  },
  {
    id: 'vend-0007-0000-0000-000000000007',
    name: 'Allied Property Handyman',
    category: 'general',
    contact_name: 'Brett Olsen',
    email: 'jobs@alliedph.example',
    phone: '(612) 555-0922',
    license_number: 'MN-HM-3322',
    insurance_expiry_date: '2026-12-31',
    coi_storage_path: 'vendor-coi/alliedph-2026.pdf',
    rating: 3.9,
    building_ids: [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ],
    active: true,
    created_at: '2025-12-15T08:00:00Z',
    updated_at: '2025-12-15T08:00:00Z',
    deleted_at: null,
  },
]

export const workOrderFixtures: WorkOrder[] = [
  {
    id: 'wo-001',
    maintenance_request_id: 'tmr-sj-002',
    vendor_id: 'vend-0003-0000-0000-000000000003',
    status: 'in_progress',
    assigned_at: '2026-01-17T13:00:00Z',
    acknowledged_at: '2026-01-17T13:30:00Z',
    started_at: '2026-01-17T15:00:00Z',
    completed_at: null,
    cost_cents: null,
    notes: 'Blower motor on order; ETA 2 business days.',
    photo_paths: [],
    vendor_token: 'wo-001-token-demo',
  },
  {
    id: 'wo-002',
    maintenance_request_id: 'tmr-ml-001',
    vendor_id: 'vend-0001-0000-0000-000000000001',
    status: 'scheduled',
    assigned_at: '2026-04-29T11:00:00Z',
    acknowledged_at: '2026-04-29T11:15:00Z',
    started_at: null,
    completed_at: null,
    cost_cents: null,
    notes: 'Booked for May 7 10a-2p.',
    photo_paths: [],
    vendor_token: 'wo-002-token-demo',
  },
  {
    id: 'wo-003',
    maintenance_request_id: 'tmr-er-002',
    vendor_id: 'vend-0005-0000-0000-000000000005',
    status: 'in_progress',
    assigned_at: '2026-04-11T09:00:00Z',
    acknowledged_at: '2026-04-11T09:20:00Z',
    started_at: '2026-04-12T11:00:00Z',
    completed_at: null,
    cost_cents: 12500,
    notes: 'Initial treatment done; follow-up in 2 weeks.',
    photo_paths: [],
    vendor_token: 'wo-003-token-demo',
  },
  {
    id: 'wo-004',
    maintenance_request_id: 'tmr-dc-001',
    vendor_id: 'vend-0004-0000-0000-000000000004',
    status: 'scheduled',
    assigned_at: '2026-04-21T11:00:00Z',
    acknowledged_at: null,
    started_at: null,
    completed_at: null,
    cost_cents: null,
    notes: null,
    photo_paths: [],
    vendor_token: 'wo-004-token-demo',
  },
]

export const surveyFixtures: Survey[] = [
  {
    id: 'srv-001',
    request_id: 'tmr-sj-001',
    rating: 5,
    feedback: 'Quick and thorough. Thanks!',
    submitted_at: '2025-11-15T18:00:00Z',
  },
  {
    id: 'srv-002',
    request_id: 'tmr-ml-002',
    rating: 4,
    feedback: 'Professional, on time.',
    submitted_at: '2025-12-08T10:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

function warnFallback(method: string, err: unknown) {
  const msg = (err as { message?: string })?.message ?? String(err)
  // eslint-disable-next-line no-console
  console.warn(`[vendors:${method}] Supabase query failed; falling back to fixtures. Reason: ${msg}`)
}

export async function listVendors(opts: {
  category?: VendorCategory
  active_only?: boolean
} = {}): Promise<Vendor[]> {
  const filter = (rows: Vendor[]): Vendor[] => {
    let out = rows.filter((v) => v.deleted_at == null)
    if (opts.active_only !== false) out = out.filter((v) => v.active)
    if (opts.category) out = out.filter((v) => v.category === opts.category)
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }
  if (isMockMode()) return filter(vendorFixtures)
  try {
    let q = supabase.from('vendors').select('*').is('deleted_at', null)
    if (opts.active_only !== false) q = q.eq('active', true)
    if (opts.category) q = q.eq('category', opts.category)
    const { data, error } = await q.order('name')
    if (error) throw error
    if (!data || data.length === 0) return filter(vendorFixtures)
    return data as Vendor[]
  } catch (e) {
    warnFallback('listVendors', e)
    return filter(vendorFixtures)
  }
}

export async function getVendorById(id: string): Promise<Vendor | null> {
  const fallback = () => vendorFixtures.find((v) => v.id === id) ?? null
  if (isMockMode()) return fallback()
  try {
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return (data as Vendor | null) ?? fallback()
  } catch (e) {
    warnFallback('getVendorById', e)
    return fallback()
  }
}

export async function listWorkOrders(opts: {
  vendor_id?: string
  request_id?: string
  status?: WorkOrderStatus
} = {}): Promise<WorkOrder[]> {
  const filter = (rows: WorkOrder[]): WorkOrder[] => {
    let out = rows.slice()
    if (opts.vendor_id) out = out.filter((w) => w.vendor_id === opts.vendor_id)
    if (opts.request_id) out = out.filter((w) => w.maintenance_request_id === opts.request_id)
    if (opts.status) out = out.filter((w) => w.status === opts.status)
    return out.sort((a, b) => b.assigned_at.localeCompare(a.assigned_at))
  }
  if (isMockMode()) return filter(workOrderFixtures)
  try {
    let q = supabase.from('work_orders').select('*')
    if (opts.vendor_id) q = q.eq('vendor_id', opts.vendor_id)
    if (opts.request_id) q = q.eq('maintenance_request_id', opts.request_id)
    if (opts.status) q = q.eq('status', opts.status)
    const { data, error } = await q.order('assigned_at', { ascending: false })
    if (error) throw error
    if (!data || data.length === 0) return filter(workOrderFixtures)
    return data as WorkOrder[]
  } catch (e) {
    warnFallback('listWorkOrders', e)
    return filter(workOrderFixtures)
  }
}

export function getSurveyForRequest(requestId: string): Survey | null {
  return surveyFixtures.find((s) => s.request_id === requestId) ?? null
}

// ---------------------------------------------------------------------------
// COI helpers
// ---------------------------------------------------------------------------

export interface CoiStatus {
  state: 'ok' | 'expiring' | 'expired' | 'missing'
  days_until_expiry: number | null
}

export function coiStatus(vendor: Vendor, today: Date = new Date()): CoiStatus {
  if (!vendor.insurance_expiry_date) return { state: 'missing', days_until_expiry: null }
  const expiry = new Date(vendor.insurance_expiry_date + 'T00:00:00Z')
  const ms = expiry.getTime() - today.getTime()
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  if (days < 0) return { state: 'expired', days_until_expiry: days }
  if (days <= 30) return { state: 'expiring', days_until_expiry: days }
  return { state: 'ok', days_until_expiry: days }
}

// ---------------------------------------------------------------------------
// Auto-dispatch eligibility
// ---------------------------------------------------------------------------

/**
 * Returns true when the system should auto-dispatch a vendor (or page on-call):
 * emergency urgency OR high-urgency overnight.
 */
export function shouldAutoDispatch(urgency: 'low' | 'normal' | 'high' | 'emergency'): boolean {
  return urgency === 'emergency' || urgency === 'high'
}

/**
 * Pick the highest-rated active vendor for a request category, optionally
 * scoped to a building. Returns null if no candidates exist.
 */
export function pickAutoDispatchVendor(
  vendors: Vendor[],
  category: VendorCategory | 'other',
  building_id?: string,
): Vendor | null {
  const target: VendorCategory = category === 'other' ? 'general' : category
  const candidates = vendors.filter((v) => {
    if (!v.active || v.deleted_at) return false
    if (v.category !== target && v.category !== 'general') return false
    if (building_id && v.building_ids.length > 0 && !v.building_ids.includes(building_id)) return false
    return true
  })
  if (candidates.length === 0) return null
  return candidates.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ?? null
}

// ---------------------------------------------------------------------------
// Token signing (vendor portal + survey)
// ---------------------------------------------------------------------------

function getSecret(): string {
  // Server-only context (API routes / SSR). Avoid throwing at import time so
  // builds in mock mode still succeed without VENDOR_PORTAL_SECRET.
  const secret =
    (typeof process !== 'undefined' && process.env?.VENDOR_PORTAL_SECRET) ||
    'dev-vendor-portal-secret-change-me'
  return secret
}

async function hmacSha256(key: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message))
  // base64url
  const bytes = new Uint8Array(sig)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface TokenPayload {
  /** "wo" for vendor work-order tokens, "sv" for tenant survey tokens */
  kind: 'wo' | 'sv'
  /** work_order_id or maintenance_request_id depending on kind */
  id: string
  /** issued-at seconds */
  iat: number
}

export async function signToken(payload: TokenPayload): Promise<string> {
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const sig = await hmacSha256(getSecret(), body)
  return `${body}.${sig}`
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = await hmacSha256(getSecret(), body)
  if (sig !== expected) return null
  try {
    const padded = body.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const parsed = JSON.parse(json) as TokenPayload
    if (parsed.kind !== 'wo' && parsed.kind !== 'sv') return null
    return parsed
  } catch {
    return null
  }
}
