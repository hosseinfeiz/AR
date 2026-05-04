export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { getYearEndReport } from '../../../lib/finance-data'
import {
  EXPENSE_CATEGORY_LABELS,
  SCHEDULE_E_LINE,
  type ExpenseCategory,
} from '../../../lib/finance-fixtures'
import { buildings } from '../../../lib/fixtures'

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

export const GET: APIRoute = ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const url = new URL(request.url)
  const year = parseInt(url.searchParams.get('year') ?? '2025', 10)
  const filterBuilding = url.searchParams.get('building') ?? ''

  const validYears = [2024, 2025, 2026]
  const safeYear = validYears.includes(year) ? year : 2025

  const buildingId = filterBuilding || undefined
  const report = getYearEndReport(safeYear, buildingId)

  const buildingLabel = buildingId
    ? buildings.find((b) => b.id === buildingId)?.name ?? 'Unknown'
    : 'All properties'

  const lines: string[] = []
  lines.push(`A & R Management — Schedule E / P&L Report`)
  lines.push(`Tax Year,${safeYear}`)
  lines.push(`Property,${escapeCsv(buildingLabel)}`)
  lines.push(`Generated,May 4 2026`)
  lines.push(``)
  lines.push(`Section,Item,Schedule E Line,Amount USD`)
  lines.push(`Income,Rent received,Line 3,${(report.income_cents / 100).toFixed(2)}`)
  lines.push(``)

  // Sort expense categories by line number
  const catEntries = Object.entries(report.expense_breakdown) as [ExpenseCategory, number][]
  const sortedCats = catEntries
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => {
      const lineA = parseInt(SCHEDULE_E_LINE[a].replace('Line ', ''), 10)
      const lineB = parseInt(SCHEDULE_E_LINE[b].replace('Line ', ''), 10)
      return lineA - lineB
    })

  for (const [cat, amount] of sortedCats) {
    lines.push(`Expenses,${escapeCsv(EXPENSE_CATEGORY_LABELS[cat])},${SCHEDULE_E_LINE[cat]},${(amount / 100).toFixed(2)}`)
  }

  lines.push(`Expenses,Depreciation (Estimated — CPA supplied),Line 18,${(report.depreciation_cents / 100).toFixed(2)}`)
  lines.push(``)
  lines.push(`Summary,Total Income,,${(report.income_cents / 100).toFixed(2)}`)
  lines.push(`Summary,Total Expenses (excl. depreciation),,${(report.total_expenses_cents / 100).toFixed(2)}`)
  lines.push(`Summary,Depreciation,,${(report.depreciation_cents / 100).toFixed(2)}`)
  lines.push(`Summary,Net Rental Income (Loss),,${((report.noi_cents - report.depreciation_cents) / 100).toFixed(2)}`)
  lines.push(``)
  lines.push(`DISCLAIMER: This report is a draft only. Not a tax filing. Consult a licensed CPA.`)

  const csv = lines.join('\r\n')

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ar-schedule-e-${safeYear}.csv"`,
    },
  })
}
