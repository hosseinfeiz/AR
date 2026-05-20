import { describe, expect, it } from 'vitest'
import {
  getIncomeForRange,
  getRentRoll,
  getMonthlyTotals,
  TODAY,
} from '../../src/lib/finance-data'
import { leases, tenants, charges, payments } from '../../src/lib/tenant-fixtures'

const GLM = '11111111-1111-1111-1111-111111111111'
const WM = '22222222-2222-2222-2222-222222222222'

describe('getRentRoll', () => {
  it('returns one row per active lease, preserving lease order', () => {
    const rows = getRentRoll()
    const activeLeases = leases.filter((l) => l.status === 'active')
    expect(rows).toHaveLength(activeLeases.length)
    // Order should follow the leases array, since we only filter (no resort).
    expect(rows.map((r) => r.tenant_id)).toEqual(
      activeLeases.map((l) => l.tenant_id),
    )
  })

  it('returns the documented row shape with exactly the expected keys', () => {
    const [row] = getRentRoll()
    expect(row).toBeDefined()
    expect(Object.keys(row!).sort()).toEqual(
      [
        'building_id',
        'current_month_status',
        'monthly_rent_cents',
        'tenant_id',
        'tenant_name',
        'unit_label',
      ].sort(),
    )
    expect(typeof row!.tenant_id).toBe('string')
    expect(typeof row!.tenant_name).toBe('string')
    expect(typeof row!.building_id).toBe('string')
    expect(typeof row!.unit_label).toBe('string')
    expect(typeof row!.monthly_rent_cents).toBe('number')
    expect(['paid', 'due', 'overdue', 'no_charge']).toContain(
      row!.current_month_status,
    )
  })

  it('matches the canonical Array.find() implementation row-for-row', () => {
    // Reference implementation: the exact pre-refactor logic.
    const asOf = TODAY
    const refMonth = asOf.slice(0, 7)
    const expected = leases
      .filter((l) => l.status === 'active')
      .map((lease) => {
        const tenant = tenants.find((t) => t.id === lease.tenant_id)
        if (!tenant) return null
        const currentCharge = charges.find(
          (c) =>
            c.tenant_id === lease.tenant_id && c.due_date.startsWith(refMonth),
        )
        return {
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          building_id: tenant.building_id,
          unit_label: tenant.unit_label,
          monthly_rent_cents: lease.monthly_rent_cents,
          current_month_status: (currentCharge?.status ?? 'no_charge') as
            | 'paid'
            | 'due'
            | 'overdue'
            | 'no_charge',
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)

    expect(getRentRoll()).toEqual(expected)
  })

  it('marks a tenant with no charge for the reference month as no_charge', () => {
    // Pick a month far in the future where no fixture charges exist.
    // (Fixture charges go through Oct 2025 + 6 months, plus Marcus Lee's
    // 2026-04 overdue one. December 2027 has nothing.)
    const rows = getRentRoll('2027-12-15')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.current_month_status).toBe('no_charge')
    }
  })

  it('picks up Marcus Lee’s explicit overdue April 2026 charge', () => {
    const rows = getRentRoll('2026-04-15')
    const marcus = rows.find(
      (r) => r.tenant_id === 'tenant-0002-0000-0000-000000000002',
    )
    expect(marcus).toBeDefined()
    expect(marcus!.current_month_status).toBe('overdue')
  })
})

describe('getIncomeForRange', () => {
  it('sums all payments within an inclusive date window', () => {
    const expected = payments
      .filter((p) => {
        const d = p.paid_at.slice(0, 10)
        return d >= '2026-01-01' && d <= '2026-04-30'
      })
      .reduce((s, p) => s + p.amount_cents, 0)
    const actual = getIncomeForRange({ from: '2026-01-01', to: '2026-04-30' })
    expect(actual).toBe(expected)
    // Sanity: there are real payments in this window.
    expect(actual).toBeGreaterThan(0)
  })

  it('filters by building_id via charge → tenant lookup', () => {
    const glm = getIncomeForRange({
      from: '2026-01-01',
      to: '2026-04-30',
      building_id: GLM,
    })
    const wm = getIncomeForRange({
      from: '2026-01-01',
      to: '2026-04-30',
      building_id: WM,
    })
    const both = getIncomeForRange({ from: '2026-01-01', to: '2026-04-30' })
    expect(glm).toBeGreaterThan(0)
    expect(wm).toBeGreaterThan(0)
    // Each building's slice should be strictly smaller than the combined total.
    expect(glm).toBeLessThan(both)
    expect(wm).toBeLessThan(both)
    // And the two slices should sum to the whole (every charge maps to exactly
    // one building in the fixtures).
    expect(glm + wm).toBe(both)
  })

  it('returns 0 for a window with no payments (edge case)', () => {
    // Pre-2020 has no fixture payments.
    expect(
      getIncomeForRange({ from: '2010-01-01', to: '2010-12-31' }),
    ).toBe(0)
  })

  it('returns 0 for an unknown building_id', () => {
    expect(
      getIncomeForRange({
        from: '2026-01-01',
        to: '2026-12-31',
        building_id: '00000000-0000-0000-0000-000000000000',
      }),
    ).toBe(0)
  })
})

describe('getMonthlyTotals', () => {
  it('returns one entry per month in the window in chronological order', () => {
    const rows = getMonthlyTotals({ from: '2026-01-01', to: '2026-05-31' })
    expect(rows.map((r) => r.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
    ])
  })

  it('per-month income equals the row-level getIncomeForRange call', () => {
    const rows = getMonthlyTotals({ from: '2026-01-01', to: '2026-04-30' })
    for (const row of rows) {
      const [year, month] = row.month.split('-').map(Number)
      const monthStart = `${row.month}-01`
      const lastDay = new Date(Date.UTC(year!, month!, 0))
        .toISOString()
        .slice(0, 10)
      const expected = getIncomeForRange({ from: monthStart, to: lastDay })
      expect(row.income_cents).toBe(expected)
    }
  })
})
