// Applicant pipeline data layer (S2).
//
// Mirrors the dual-mode pattern in `data.ts`:
//   - Mock mode  (no SUPABASE_URL configured)        → in-memory fixtures
//   - Real mode  (SUPABASE_URL + service-role key)   → Supabase
//   - Degraded   (Supabase set but query fails)      → warn + fall back to mock
//
// The legal status state machine implemented here:
//   inquiry      → application | withdrawn
//   application  → screening   | withdrawn
//   screening    → lease_ready | application | withdrawn   (review = stays at screening)
//   lease_ready  → signed      | withdrawn
//   signed       → (terminal)
//   withdrawn    → (terminal)
//
// `transitionStatus` enforces these transitions server-side.

import { getAdminClient } from './supabase-admin'

export type ApplicantStatus =
  | 'inquiry'
  | 'application'
  | 'screening'
  | 'lease_ready'
  | 'signed'
  | 'withdrawn'

export interface Applicant {
  id: string
  name: string
  email: string
  phone: string | null
  building_id: string
  unit_id: string | null
  move_in_date: string | null // 'YYYY-MM-DD'
  monthly_income_cents: number | null
  status: ApplicantStatus
  screening_provider_ref: string | null
  screening_score: number | null
  screening_recommendation: 'accept' | 'review' | 'decline' | null
  esign_envelope_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export const APPLICANT_STATUSES: ApplicantStatus[] = [
  'inquiry',
  'application',
  'screening',
  'lease_ready',
  'signed',
  'withdrawn',
]

// State machine — `from` → set of valid `to` statuses.
const ALLOWED_TRANSITIONS: Record<ApplicantStatus, ApplicantStatus[]> = {
  inquiry:     ['application', 'withdrawn'],
  application: ['screening',   'withdrawn'],
  screening:   ['lease_ready', 'application', 'withdrawn'],
  lease_ready: ['signed',      'withdrawn'],
  signed:      [],
  withdrawn:   [],
}

export function canTransition(from: ApplicantStatus, to: ApplicantStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function allowedNextStatuses(from: ApplicantStatus): ApplicantStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? []
}

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

function hasSupabaseEnv(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
}

function warnFallback(method: string, err: unknown) {
  const msg = (err as { message?: string })?.message ?? String(err)
  // eslint-disable-next-line no-console
  console.warn(`[applicants:${method}] Supabase query failed; using in-memory store. Reason: ${msg}`)
}

// ---------------------------------------------------------------------------
// In-memory fixture store (mock mode)
// ---------------------------------------------------------------------------

function uuid(): string {
  // RFC4122 v4-ish — sufficient for fixtures
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  if (g.crypto?.randomUUID) return g.crypto.randomUUID()
  // Fallback (not cryptographically strong)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const memoryStore: Applicant[] = [
  {
    id: 'app-0001-0000-0000-000000000001',
    name: 'Olivia Park',
    email: 'olivia.park@demo.test',
    phone: '(612) 555-1101',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_id: 'aaaa1111-1111-1111-1111-111111111111',
    move_in_date: '2026-06-15',
    monthly_income_cents: 525000,
    status: 'application',
    screening_provider_ref: null,
    screening_score: null,
    screening_recommendation: null,
    esign_envelope_id: null,
    created_at: '2026-05-10T09:00:00Z',
    updated_at: '2026-05-12T14:00:00Z',
    deleted_at: null,
  },
  {
    id: 'app-0002-0000-0000-000000000002',
    name: 'Trevor Khan',
    email: 'trevor.khan@demo.test',
    phone: '(763) 555-1102',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_id: 'bbbb1111-1111-1111-1111-111111111111',
    move_in_date: '2026-07-01',
    monthly_income_cents: 612000,
    status: 'screening',
    screening_provider_ref: 'mock-sm-trevor',
    screening_score: 712,
    screening_recommendation: 'accept',
    esign_envelope_id: null,
    created_at: '2026-05-05T10:30:00Z',
    updated_at: '2026-05-15T11:00:00Z',
    deleted_at: null,
  },
  {
    id: 'app-0003-0000-0000-000000000003',
    name: 'Sofia Aguilar',
    email: 'sofia.aguilar@demo.test',
    phone: '(612) 555-1103',
    building_id: '11111111-1111-1111-1111-111111111111',
    unit_id: 'aaaa2222-2222-2222-2222-222222222222',
    move_in_date: '2026-06-01',
    monthly_income_cents: 480000,
    status: 'inquiry',
    screening_provider_ref: null,
    screening_score: null,
    screening_recommendation: null,
    esign_envelope_id: null,
    created_at: '2026-05-18T08:00:00Z',
    updated_at: '2026-05-18T08:00:00Z',
    deleted_at: null,
  },
  {
    id: 'app-0004-0000-0000-000000000004',
    name: 'Henry Brooks',
    email: 'henry.brooks@demo.test',
    phone: '(763) 555-1104',
    building_id: '22222222-2222-2222-2222-222222222222',
    unit_id: 'bbbb2222-2222-2222-2222-222222222222',
    move_in_date: '2026-08-01',
    monthly_income_cents: 720000,
    status: 'lease_ready',
    screening_provider_ref: 'mock-sm-henry',
    screening_score: 745,
    screening_recommendation: 'accept',
    esign_envelope_id: 'mock-envelope-henry',
    created_at: '2026-04-22T11:15:00Z',
    updated_at: '2026-05-18T16:00:00Z',
    deleted_at: null,
  },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ListFilters {
  building_id?: string
  status?: ApplicantStatus
}

export interface CreateInput {
  name: string
  email: string
  phone?: string | null
  building_id: string
  unit_id?: string | null
  move_in_date?: string | null
  monthly_income_cents?: number | null
  status?: ApplicantStatus
}

export async function listApplicants(filters: ListFilters = {}): Promise<Applicant[]> {
  if (!hasSupabaseEnv()) return filterMemory(filters)
  try {
    const c = getAdminClient()
    let q = c.from('applicants').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    if (filters.building_id) q = q.eq('building_id', filters.building_id)
    if (filters.status) q = q.eq('status', filters.status)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Applicant[]
  } catch (e) {
    warnFallback('listApplicants', e)
    return filterMemory(filters)
  }
}

function filterMemory(filters: ListFilters): Applicant[] {
  return memoryStore
    .filter((a) => a.deleted_at === null)
    .filter((a) => !filters.building_id || a.building_id === filters.building_id)
    .filter((a) => !filters.status || a.status === filters.status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function getApplicant(id: string): Promise<Applicant | null> {
  if (!hasSupabaseEnv()) return memoryStore.find((a) => a.id === id && !a.deleted_at) ?? null
  try {
    const c = getAdminClient()
    const { data, error } = await c.from('applicants').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) throw error
    return (data as Applicant | null) ?? null
  } catch (e) {
    warnFallback('getApplicant', e)
    return memoryStore.find((a) => a.id === id && !a.deleted_at) ?? null
  }
}

export async function createApplicant(input: CreateInput): Promise<Applicant> {
  const now = new Date().toISOString()
  const row: Applicant = {
    id: uuid(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone ?? null,
    building_id: input.building_id,
    unit_id: input.unit_id ?? null,
    move_in_date: input.move_in_date ?? null,
    monthly_income_cents: input.monthly_income_cents ?? null,
    status: input.status ?? 'inquiry',
    screening_provider_ref: null,
    screening_score: null,
    screening_recommendation: null,
    esign_envelope_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }

  if (!hasSupabaseEnv()) {
    memoryStore.unshift(row)
    return row
  }

  try {
    const c = getAdminClient()
    const { data, error } = await c
      .from('applicants')
      .insert({
        name: row.name,
        email: row.email,
        phone: row.phone,
        building_id: row.building_id,
        unit_id: row.unit_id,
        move_in_date: row.move_in_date,
        monthly_income_cents: row.monthly_income_cents,
        status: row.status,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as Applicant
  } catch (e) {
    warnFallback('createApplicant', e)
    memoryStore.unshift(row)
    return row
  }
}

/**
 * Persist arbitrary fields onto an applicant — used by screening / e-sign
 * lib code to write provider refs back. Skips the state-machine guard; the
 * dedicated `transitionStatus` helper is the only way to change `status`.
 */
export async function updateApplicantFields(
  id: string,
  fields: Partial<Pick<Applicant,
    | 'screening_provider_ref'
    | 'screening_score'
    | 'screening_recommendation'
    | 'esign_envelope_id'
  >>,
): Promise<Applicant | null> {
  if (!hasSupabaseEnv()) {
    const row = memoryStore.find((a) => a.id === id)
    if (!row) return null
    Object.assign(row, fields)
    row.updated_at = new Date().toISOString()
    return row
  }
  try {
    const c = getAdminClient()
    const { data, error } = await c
      .from('applicants')
      .update(fields)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Applicant
  } catch (e) {
    warnFallback('updateApplicantFields', e)
    const row = memoryStore.find((a) => a.id === id)
    if (!row) return null
    Object.assign(row, fields)
    return row
  }
}

export class StatusTransitionError extends Error {
  constructor(public from: ApplicantStatus, public to: ApplicantStatus) {
    super(`Illegal status transition: ${from} → ${to}`)
    this.name = 'StatusTransitionError'
  }
}

export async function transitionStatus(
  id: string,
  to: ApplicantStatus,
): Promise<Applicant> {
  const current = await getApplicant(id)
  if (!current) throw new Error(`Applicant ${id} not found`)
  if (current.status === to) return current
  if (!canTransition(current.status, to)) {
    throw new StatusTransitionError(current.status, to)
  }

  if (!hasSupabaseEnv()) {
    const row = memoryStore.find((a) => a.id === id)!
    row.status = to
    row.updated_at = new Date().toISOString()
    return row
  }
  try {
    const c = getAdminClient()
    const { data, error } = await c
      .from('applicants')
      .update({ status: to })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Applicant
  } catch (e) {
    warnFallback('transitionStatus', e)
    const row = memoryStore.find((a) => a.id === id)
    if (!row) throw new Error(`Applicant ${id} not found in fallback`)
    row.status = to
    row.updated_at = new Date().toISOString()
    return row
  }
}

// ---------------------------------------------------------------------------
// Test-only — reset the in-memory store
// ---------------------------------------------------------------------------

export function __resetMemoryForTests(initial?: Applicant[]) {
  memoryStore.length = 0
  if (initial) memoryStore.push(...initial)
}

export function __getMemoryForTests(): Applicant[] {
  return memoryStore
}
