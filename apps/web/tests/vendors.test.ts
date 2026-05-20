import { describe, expect, it } from 'vitest'
import {
  vendorFixtures,
  coiStatus,
  pickAutoDispatchVendor,
  shouldAutoDispatch,
  signToken,
  verifyToken,
  type Vendor,
} from '../src/lib/vendors'

const TODAY = new Date('2026-05-20T00:00:00Z')

function v(overrides: Partial<Vendor>): Vendor {
  return {
    id: 'v',
    name: 'V',
    category: 'plumbing',
    contact_name: null, email: null, phone: null,
    license_number: null, insurance_expiry_date: null,
    coi_storage_path: null, rating: null,
    building_ids: [], active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('coiStatus', () => {
  it('returns missing when no expiry on file', () => {
    expect(coiStatus(v({ insurance_expiry_date: null }), TODAY).state).toBe('missing')
  })
  it('returns expired when the expiry is in the past', () => {
    const s = coiStatus(v({ insurance_expiry_date: '2026-01-01' }), TODAY)
    expect(s.state).toBe('expired')
    expect(s.days_until_expiry).toBeLessThan(0)
  })
  it('returns expiring within 30 days', () => {
    const s = coiStatus(v({ insurance_expiry_date: '2026-06-05' }), TODAY)
    expect(s.state).toBe('expiring')
    expect(s.days_until_expiry).toBeGreaterThan(0)
    expect(s.days_until_expiry!).toBeLessThanOrEqual(30)
  })
  it('returns ok when expiry is far out', () => {
    expect(coiStatus(v({ insurance_expiry_date: '2027-01-01' }), TODAY).state).toBe('ok')
  })
})

describe('shouldAutoDispatch', () => {
  it.each(['emergency', 'high'] as const)('returns true for %s', (u) => {
    expect(shouldAutoDispatch(u)).toBe(true)
  })
  it.each(['normal', 'low'] as const)('returns false for %s', (u) => {
    expect(shouldAutoDispatch(u)).toBe(false)
  })
})

describe('pickAutoDispatchVendor', () => {
  const A = v({ id: 'A', category: 'plumbing', rating: 4.0, active: true })
  const B = v({ id: 'B', category: 'plumbing', rating: 4.8, active: true, building_ids: ['b1'] })
  const C = v({ id: 'C', category: 'plumbing', rating: 5.0, active: false })
  const G = v({ id: 'G', category: 'general', rating: 3.5, active: true })

  it('returns the highest-rated active vendor in the category', () => {
    expect(pickAutoDispatchVendor([A, B, C], 'plumbing')?.id).toBe('B')
  })
  it('falls back to general handyman when category has no match', () => {
    expect(pickAutoDispatchVendor([G], 'plumbing')?.id).toBe('G')
  })
  it('maps "other" issue type to general handyman', () => {
    expect(pickAutoDispatchVendor([G], 'other')?.id).toBe('G')
  })
  it('respects building scoping when vendor has explicit building_ids', () => {
    const pick = pickAutoDispatchVendor([A, B], 'plumbing', 'b2')
    expect(pick?.id).toBe('A') // B requires b1; A has no building restriction
  })
  it('returns null when no candidates exist', () => {
    expect(pickAutoDispatchVendor([], 'plumbing')).toBeNull()
  })
})

describe('vendor fixtures', () => {
  it('contains at least one vendor per category', () => {
    const cats = new Set(vendorFixtures.map((x) => x.category))
    for (const c of ['plumbing', 'electrical', 'hvac', 'appliance', 'pest', 'locks', 'general']) {
      expect(cats.has(c as Vendor['category'])).toBe(true)
    }
  })
})

describe('HMAC tokens', () => {
  it('round-trips a valid payload', async () => {
    const t = await signToken({ kind: 'wo', id: 'wo-123', iat: 1700000000 })
    const verified = await verifyToken(t)
    expect(verified).toEqual({ kind: 'wo', id: 'wo-123', iat: 1700000000 })
  })
  it('rejects a tampered token', async () => {
    const t = await signToken({ kind: 'sv', id: 'req-1', iat: 1 })
    const tampered = t.slice(0, -2) + (t.endsWith('A') ? 'BB' : 'AA')
    expect(await verifyToken(tampered)).toBeNull()
  })
  it('rejects garbage', async () => {
    expect(await verifyToken('not.a.token')).toBeNull()
    expect(await verifyToken('')).toBeNull()
  })
})
