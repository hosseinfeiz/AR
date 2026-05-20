// Tests for lib/rent-comp. We inject a fake fetch via the context's
// `fetchImpl` so we don't need to mock the global.

import { describe, expect, it, vi } from 'vitest'
import {
  fetchRentComp,
  mockRentComp,
  summarizeRentComp,
  type RentCompCtx,
} from '../src/lib/rent-comp'

const INPUT = {
  address: '928 Rae Drive',
  city: 'Richfield',
  state: 'MN',
  postal_code: '55423',
  bedrooms: 1,
  unit_rent_cents: 99500,
}

function ctx(overrides: Partial<RentCompCtx> = {}): RentCompCtx {
  return {
    apiKey: undefined,
    log: vi.fn(),
    ...overrides,
  }
}

describe('mockRentComp', () => {
  it('returns ±15% range around current rent and source = mock-fallback', () => {
    const r = mockRentComp(INPUT)
    expect(r.source).toBe('mock-fallback')
    expect(r.median_cents).toBe(99500)
    expect(r.p25_cents).toBe(Math.round(99500 * 0.85))
    expect(r.p75_cents).toBe(Math.round(99500 * 1.15))
    expect(r.samples).toBe(0)
    expect(r.delta_vs_median_cents).toBe(0)
    expect(r.note).toMatch(/Mock data/i)
  })
})

describe('fetchRentComp', () => {
  it('returns mock-fallback when API key is unset and never calls fetch', async () => {
    const fetchSpy = vi.fn()
    const r = await fetchRentComp(ctx({ fetchImpl: fetchSpy as unknown as typeof fetch }), INPUT)
    expect(r.source).toBe('mock-fallback')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('hits Rentometer when key is set and parses the response', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          mean: 1100,
          median: 1050,
          percentile_25: 950,
          percentile_75: 1200,
          samples: 22,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const r = await fetchRentComp(
      ctx({ apiKey: 'rk_test', fetchImpl: fetchSpy as unknown as typeof fetch }),
      INPUT,
    )
    expect(r.source).toBe('rentometer')
    expect(r.median_cents).toBe(105000)
    expect(r.mean_cents).toBe(110000)
    expect(r.p25_cents).toBe(95000)
    expect(r.p75_cents).toBe(120000)
    expect(r.samples).toBe(22)
    expect(r.delta_vs_median_cents).toBe(99500 - 105000)
    expect(r.delta_vs_median_pct).toBeCloseTo(-5.2, 1)

    // Verify URL shape.
    const call = fetchSpy.mock.calls[0]
    if (!call || call.length === 0) throw new Error('expected fetch to have been called')
    const calledUrl = String((call as unknown as [string])[0])
    expect(calledUrl).toMatch(/rentometer\.com/)
    expect(calledUrl).toMatch(/api_key=rk_test/)
    expect(calledUrl).toMatch(/bedrooms=1/)
    // URLSearchParams encodes spaces as '+', so normalize before asserting.
    expect(decodeURIComponent(calledUrl).replace(/\+/g, ' ')).toContain('928 Rae Drive, Richfield, MN 55423')
  })

  it('falls back to mock when Rentometer returns < 3 comps', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ median: 999, samples: 1 }), { status: 200 }),
    )
    const r = await fetchRentComp(
      ctx({ apiKey: 'rk_test', fetchImpl: fetchSpy as unknown as typeof fetch }),
      INPUT,
    )
    expect(r.source).toBe('mock-fallback')
    expect(r.note).toMatch(/comp/)
  })

  it('falls back to mock on non-OK response', async () => {
    const fetchSpy = vi.fn(async () => new Response('boom', { status: 500 }))
    const r = await fetchRentComp(
      ctx({ apiKey: 'rk_test', fetchImpl: fetchSpy as unknown as typeof fetch }),
      INPUT,
    )
    expect(r.source).toBe('mock-fallback')
    expect(r.note).toMatch(/Rentometer 500/)
  })

  it('falls back to mock when fetch throws', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const r = await fetchRentComp(
      ctx({ apiKey: 'rk_test', fetchImpl: fetchSpy as unknown as typeof fetch }),
      INPUT,
    )
    expect(r.source).toBe('mock-fallback')
    expect(r.note).toMatch(/unreachable/i)
  })

  it('tolerates camelCase percentile keys', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({ median: 1000, percentile25: 900, percentile75: 1100, samples: 10 }),
        { status: 200 },
      ),
    )
    const r = await fetchRentComp(
      ctx({ apiKey: 'rk_test', fetchImpl: fetchSpy as unknown as typeof fetch }),
      INPUT,
    )
    expect(r.source).toBe('rentometer')
    expect(r.p25_cents).toBe(90000)
    expect(r.p75_cents).toBe(110000)
  })
})

describe('summarizeRentComp', () => {
  it('summarizes a mock-fallback distinctly from Rentometer data', () => {
    const mock = mockRentComp(INPUT)
    const summary = summarizeRentComp(mock)
    expect(summary).toMatch(/no comps/i)
  })

  it('says "at market" when delta_pct is 0', () => {
    const r = {
      source: 'rentometer' as const,
      mean_cents: 105000,
      median_cents: 105000,
      p25_cents: 95000,
      p75_cents: 120000,
      samples: 20,
      delta_vs_median_cents: 0,
      delta_vs_median_pct: 0,
      fetched_at: new Date().toISOString(),
    }
    expect(summarizeRentComp(r)).toMatch(/at market/i)
  })

  it('labels above/below market correctly', () => {
    const above = summarizeRentComp({
      source: 'rentometer',
      mean_cents: 100000,
      median_cents: 100000,
      p25_cents: 90000,
      p75_cents: 110000,
      samples: 20,
      delta_vs_median_cents: 10000,
      delta_vs_median_pct: 10,
      fetched_at: new Date().toISOString(),
    })
    expect(above).toMatch(/above market/i)

    const below = summarizeRentComp({
      source: 'rentometer',
      mean_cents: 100000,
      median_cents: 100000,
      p25_cents: 90000,
      p75_cents: 110000,
      samples: 20,
      delta_vs_median_cents: -8000,
      delta_vs_median_pct: -8,
      fetched_at: new Date().toISOString(),
    })
    expect(below).toMatch(/below market/i)
  })
})
