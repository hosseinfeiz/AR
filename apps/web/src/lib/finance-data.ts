// Finance data layer — combines income (tenant payments) + expenses for reports.
// All money in cents. Today's reference date: 2026-05-04.

import { payments, charges, leases, tenants } from './tenant-fixtures'
import {
  totalExpenses,
  expensesByCategory,
  type ExpenseCategory,
} from './finance-fixtures'
import { buildings } from './fixtures'

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

  // Build a map of charge_id → building_id via lease → unit (tenant.building_id)
  const chargeBuilding = new Map<string, string>()
  for (const charge of charges) {
    const tenant = tenants.find((t) => t.id === charge.tenant_id)
    if (tenant) chargeBuilding.set(charge.id, tenant.building_id)
  }

  return payments
    .filter((p) => {
      const date = p.paid_at.slice(0, 10)
      if (date < from || date > to) return false
      if (building_id) {
        const bId = chargeBuilding.get(p.charge_id)
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

    const income_cents = getIncomeForRange({
      from: monthStart,
      to: monthEnd,
      building_id: opts.building_id,
    })
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

  return leases
    .filter((l) => l.status === 'active')
    .map((lease) => {
      const tenant = tenants.find((t) => t.id === lease.tenant_id)
      if (!tenant) return null

      // Find the charge for the current month
      const currentCharge = charges.find((c) => {
        return c.tenant_id === lease.tenant_id && c.due_date.startsWith(refMonth)
      })

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
