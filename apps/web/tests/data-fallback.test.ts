// F6: data-layer degraded-mode fallback tests.
//
// Targets the degraded-mode behaviour of listBuildings, getBuildingBySlug,
// listAvailableUnits, getUnitById in apps/web/src/lib/data.ts.
//
// Strategy:
//   - Set PUBLIC_SUPABASE_URL so isMockMode() returns false (otherwise
//     the data layer never reaches Supabase and we never exercise the
//     try/catch fallback).
//   - vi.mock the supabase client so every query chain throws.
//   - Assert that the functions return the fixture data anyway and do
//     NOT throw.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Make isMockMode() return false. Read by ../src/lib/fixtures.
beforeAll(() => {
  ;(import.meta as any).env.PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  ;(import.meta as any).env.PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
})

// Stub the supabase client so any .from(...).select(...).eq(...)... chain
// resolves to { data: null, error: { message: 'boom' } }, which triggers
// the catch block in data.ts.
vi.mock('../src/lib/supabase', () => {
  function makeChain(): any {
    const handler: ProxyHandler<any> = {
      get(_t, prop) {
        if (prop === 'then') {
          // Make the chain awaitable — resolves with an error so data.ts
          // takes the warnFallback path.
          return (resolve: (v: any) => void) =>
            resolve({ data: null, error: { message: 'simulated supabase failure' } })
        }
        return () => makeChain()
      },
    }
    return new Proxy(function () {}, handler)
  }
  return {
    supabase: {
      from: () => makeChain(),
    },
  }
})

// Import AFTER the mock is registered.
const { listBuildings, getBuildingBySlug, listAvailableUnits, getUnitById } = await import(
  '../src/lib/data'
)
const { buildings: fixBuildings, units: fixUnits } = await import('../src/lib/fixtures')

beforeEach(() => {
  // Silence the warnFallback console.warn so test output stays clean.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('listBuildings degraded-mode fallback', () => {
  it('returns published fixture buildings when supabase fails', async () => {
    const result = await listBuildings()
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((b) => b.is_published)).toBe(true)
    const slugs = result.map((b) => b.slug).sort()
    expect(slugs).toContain('grass-lake-manor')
    expect(slugs).toContain('winnetka-manor')
  })

  it('does not throw when supabase rejects', async () => {
    await expect(listBuildings()).resolves.toBeDefined()
  })
})

describe('getBuildingBySlug degraded-mode fallback', () => {
  it('returns the matching fixture for a known slug', async () => {
    const b = await getBuildingBySlug('grass-lake-manor')
    expect(b).not.toBeNull()
    expect(b!.slug).toBe('grass-lake-manor')
    expect(b!.name).toMatch(/Grass Lake/)
  })

  it('returns null for an unknown slug', async () => {
    const b = await getBuildingBySlug('definitely-not-a-real-building')
    expect(b).toBeNull()
  })
})

describe('listAvailableUnits degraded-mode fallback', () => {
  it('returns available/coming_soon units when supabase fails', async () => {
    const units = await listAvailableUnits()
    expect(units.length).toBeGreaterThan(0)
    expect(units.every((u) => u.status === 'available' || u.status === 'coming_soon')).toBe(true)
  })

  it('honours building_id filter against fixtures', async () => {
    const buildingId = fixBuildings[0]!.id
    const units = await listAvailableUnits({ building_id: buildingId })
    expect(units.every((u) => u.building_id === buildingId)).toBe(true)
  })

  it('honours building_slug filter against fixtures', async () => {
    const units = await listAvailableUnits({ building_slug: 'winnetka-manor' })
    const winId = fixBuildings.find((b) => b.slug === 'winnetka-manor')!.id
    expect(units.every((u) => u.building_id === winId)).toBe(true)
  })

  it('honours bedrooms filter (3 means 3+)', async () => {
    const units = await listAvailableUnits({ bedrooms: 3 })
    expect(units.every((u) => u.bedrooms >= 3)).toBe(true)
  })

  it('honours max_rent_cents filter', async () => {
    const cap = 100000
    const units = await listAvailableUnits({ max_rent_cents: cap })
    expect(units.every((u) => u.monthly_rent_cents <= cap)).toBe(true)
  })

  it('sorts results by monthly_rent_cents ascending', async () => {
    const units = await listAvailableUnits()
    for (let i = 1; i < units.length; i++) {
      const cur = units[i]!
      const prev = units[i - 1]!
      expect(cur.monthly_rent_cents).toBeGreaterThanOrEqual(prev.monthly_rent_cents)
    }
  })
})

describe('getUnitById degraded-mode fallback', () => {
  it('returns the matching fixture unit with its building attached', async () => {
    const target = fixUnits[0]!
    const u = await getUnitById(target.id)
    expect(u).not.toBeNull()
    expect(u!.id).toBe(target.id)
    expect(u!.building).toBeDefined()
    expect(u!.building!.id).toBe(target.building_id)
  })

  it('returns null for an unknown unit id', async () => {
    const u = await getUnitById('00000000-0000-0000-0000-000000000000')
    expect(u).toBeNull()
  })
})
