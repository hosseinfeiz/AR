// Finance data layer — combines income (tenant payments) + expenses for reports.
// All money in cents. Today's reference date: 2026-05-04.

import { payments, charges, leases, tenants, type Tenant } from './tenant-fixtures'
import {
  totalExpenses,
  expensesByCategory,
  type ExpenseCategory,
} from './finance-fixtures'
import { buildings } from './fixtures'

// ---------------------------------------------------------------------------
// Module-level lookup maps (built once at module load).
// These replace per-row Array.find() calls (O(n²) -> O(n)) for hot paths
// like getRentRoll / getIncomeForRange. The fixtures are static for the
// lifetime of the process, so caching at module scope is safe.
// ---------------------------------------------------------------------------
const tenantById: Map<string, Tenant> = new Map(tenants.map((t) => [t.id, t]))

// Map charge_id -> building_id (resolved via charge.tenant_id -> tenant.building_id).
const chargeIdToBuilding: Map<string, string> = new Map(
  charges
    .map((c) => {
      const t = tenantById.get(c.tenant_id)
      return t ? ([c.id, t.building_id] as const) : null
    })
    .filter((x): x is readonly [string, string] => x !== null),
)

export const TODAY = '2026-05-04'

export interface FinancialSummary {
  income_cents: number
  expense_cents: number
  noi_cents: number
}

export interface MonthlyTotals {
  month: string // 'YYYY-MM'
  income_cents: number
  expense_cents: number
}

// Depreciation: residential 27.5-year straight-line (per building, per year)
const DEPRECIATION_ANNUAL: Record<string, number> = {
  '11111111-1111-1111-1111-111111111111': 1850000, // GLM $18,500/yr
  '22222222-2222-2222-2222-222222222222': 2420000, // WM  $24,200/yr
}

// ---------------------------------------------------------------------------
// Income helpers
// ---------------------------------------------------------------------------

/**
 * Returns total payment amount_cents for payments where paid_at is within
 * [from, to] (inclusive ISO date strings), optionally filtered by building.
 */
export function getIncomeForRange(opts: {
  from: string
  to: string
  building_id?: string
}): number {
  const { from, to, building_id } = opts

  // chargeIdToBuilding is precomputed at module load — no per-call rebuild.
  return payments
    .filter((p) => {
      const date = p.paid_at.slice(0, 10)
      if (date < from || date > to) return false
      if (building_id) {
        const bId = chargeIdToBuilding.get(p.charge_id)
        if (bId !== building_id) return false
      }
      return true
    })
    .reduce((sum, p) => sum + p.amount_cents, 0)
}

export function getExpenseForRange(opts: {
  from: string
  to: string
  building_id?: string
}): number {
  return totalExpenses({
    from: opts.from,
    to: opts.to,
    building_id: opts.building_id,
  })
}

export function getFinancialSummary(opts: {
  from: string
  to: string
  building_id?: string
}): FinancialSummary {
  const income_cents = getIncomeForRange(opts)
  const expense_cents = getExpenseForRange(opts)
  return { income_cents, expense_cents, noi_cents: income_cents - expense_cents }
}

// ---------------------------------------------------------------------------
// Monthly totals — for bar charts
// ---------------------------------------------------------------------------

export function getMonthlyTotals(opts: {
  from: string
  to: string
  building_id?: string
}): MonthlyTotals[] {
  const result: MonthlyTotals[] = []
  const start = new Date(opts.from + 'T00:00:00Z')
  const end = new Date(opts.to + 'T00:00:00Z')

  // Build a single map of 'YYYY-MM' -> income_cents covering the full window
  // up front so the per-month loop is a Map lookup instead of an O(payments)
  // re-scan per month. Expenses are similarly bucketed.
  const incomeByMonth = new Map<string, number>()
  for (const p of payments) {
    const date = p.paid_at.slice(0, 10)
    if (date < opts.from || date > opts.to) continue
    if (opts.building_id) {
      const bId = chargeIdToBuilding.get(p.charge_id)
      if (bId !== opts.building_id) continue
    }
    const monthKey = date.slice(0, 7)
    incomeByMonth.set(monthKey, (incomeByMonth.get(monthKey) ?? 0) + p.amount_cents)
  }

  // Iterate month by month
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  while (cur <= end) {
    const year = cur.getUTCFullYear()
    const month = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const monthStr = `${year}-${month}`
    const monthStart = `${monthStr}-01`
    // Last day of month
    const lastDay = new Date(Date.UTC(year, cur.getUTCMonth() + 1, 0))
    const monthEnd = lastDay.toISOString().slice(0, 10)

    const income_cents = incomeByMonth.get(monthStr) ?? 0
    const expense_cents = getExpenseForRange({
      from: monthStart,
      to: monthEnd,
      building_id: opts.building_id,
    })

    result.push({ month: monthStr, income_cents, expense_cents })
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }

  return result
}

// ---------------------------------------------------------------------------
// Rent roll
// ---------------------------------------------------------------------------

export function getRentRoll(asOf?: string): {
  tenant_id: string
  tenant_name: string
  building_id: string
  unit_label: string
  monthly_rent_cents: number
  current_month_status: 'paid' | 'due' | 'overdue' | 'no_charge'
}[] {
  const ref = asOf ?? TODAY
  const refMonth = ref.slice(0, 7) // 'YYYY-MM'

  // Build a tenant_id -> charge map for the reference month once, instead of
  // re-scanning `charges` for every lease. Preserves prior behavior: prior
  // code used Array.find() which returned the FIRST matching charge in source
  // order, so we mirror that by only setting if not already present.
  const chargeByTenantForMonth = new Map<string, (typeof charges)[number]>()
  for (const c of charges) {
    if (!c.due_date.startsWith(refMonth)) continue
    if (!chargeByTenantForMonth.has(c.tenant_id)) {
      chargeByTenantForMonth.set(c.tenant_id, c)
    }
  }

  return leases
    .filter((l) => l.status === 'active')
    .map((lease) => {
      const tenant = tenantById.get(lease.tenant_id)
      if (!tenant) return null

      const currentCharge = chargeByTenantForMonth.get(lease.tenant_id)

      let current_month_status: 'paid' | 'due' | 'overdue' | 'no_charge' = 'no_charge'
      if (currentCharge) {
        current_month_status = currentCharge.status
      }

      return {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        building_id: tenant.building_id,
        unit_label: tenant.unit_label,
        monthly_rent_cents: lease.monthly_rent_cents,
        current_month_status,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
}

// ---------------------------------------------------------------------------
// Year-end report
// ---------------------------------------------------------------------------

export function getYearEndReport(
  year: number,
  building_id?: string,
): {
  income_cents: number
  expense_breakdown: Record<ExpenseCategory, number>
  total_expenses_cents: number
  noi_cents: number
  depreciation_cents: number
} {
  const from = `${year}-01-01`
  const to = `${year}-12-31`

  const income_cents = getIncomeForRange({ from, to, building_id })
  const expense_breakdown = expensesByCategory({ from, to, building_id })
  const total_expenses_cents = Object.values(expense_breakdown).reduce((s, v) => s + v, 0)

  // Depreciation — prorated to year; sum buildings if no filter
  let depreciation_cents = 0
  if (building_id) {
    depreciation_cents = DEPRECIATION_ANNUAL[building_id] ?? 0
  } else {
    // Sum all buildings
    for (const building of buildings) {
      depreciation_cents += DEPRECIATION_ANNUAL[building.id] ?? 0
    }
  }

  const noi_cents = income_cents - total_expenses_cents

  return {
    income_cents,
    expense_breakdown,
    total_expenses_cents,
    noi_cents,
    depreciation_cents,
  }
}

// ---------------------------------------------------------------------------
// Currency formatter helper (shared)
// ---------------------------------------------------------------------------

export function fmtCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
