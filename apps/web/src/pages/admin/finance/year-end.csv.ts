export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { getYearEndReport } from '../../../lib/finance-data'
import {
  EXPENSE_CATEGORY_LABELS,
  SCHEDULE_E_LINE,
  vendor1099Candidates,
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
  const validYears = [2024, 2025, 2026]
  const safeYear = validYears.includes(year) ? year : 2025

  const lines: string[] = []
  lines.push(`A & R Management — Year-End Summary Packet`)
  lines.push(`Tax Year,${safeYear}`)
  lines.push(`Generated,May 4 2026`)
  lines.push(``)

  // Per-building + combined
  const targets = [
    ...buildings.map((b) => ({ label: b.name, id: b.id })),
    { label: 'Combined — All Properties', id: undefined as string | undefined },
  ]

  for (const target of targets) {
    const report = getYearEndReport(safeYear, target.id)
    lines.push(`=== ${escapeCsv(target.label)} ===`)
    lines.push(`Metric,Amount USD`)
    lines.push(`Gross Rental Income,${(report.income_cents / 100).toFixed(2)}`)

    const catEntries = Object.entries(report.expense_breakdown) as [ExpenseCategory, number][]
    const sortedCats = catEntries
      .filter(([, v]) => v > 0)
      .sort(([a], [b]) => {
        const lineA = parseInt(SCHEDULE_E_LINE[a].replace('Line ', ''), 10)
        const lineB = parseInt(SCHEDULE_E_LINE[b].replace('Line ', ''), 10)
        return lineA - lineB
      })

    lines.push(``)
    lines.push(`Expense Category,Schedule E Line,Amount USD`)
    for (const [cat, amount] of sortedCats) {
      lines.push(`${escapeCsv(EXPENSE_CATEGORY_LABELS[cat])},${SCHEDULE_E_LINE[cat]},${(amount / 100).toFixed(2)}`)
    }
    lines.push(`Depreciation (Estimated — CPA supplied),Line 18,${(report.depreciation_cents / 100).toFixed(2)}`)
    lines.push(``)
    lines.push(`Summary Metric,Amount USD`)
    lines.push(`Total Expenses (excl. depreciation),${(report.total_expenses_cents / 100).toFixed(2)}`)
    lines.push(`Depreciation,${(report.depreciation_cents / 100).toFixed(2)}`)
    lines.push(`NOI (before depreciation),${(report.noi_cents / 100).toFixed(2)}`)
    lines.push(`Net Rental Income (after depreciation),${((report.noi_cents - report.depreciation_cents) / 100).toFixed(2)}`)
    lines.push(``)
  }

  // 1099 candidates
  lines.push(`=== 1099-NEC Candidates ===`)
  lines.push(`Vendor,Category,EIN/SSN last 4,Is Corporation,Total Paid ${safeYear},Needs 1099`)
  const candidates = vendor1099Candidates(safeYear)
  if (candidates.length === 0) {
    lines.push(`No candidates — no non-corporation vendors exceeded $600 threshold`)
  } else {
    for (const { vendor, total_cents } of candidates) {
      lines.push([
        escapeCsv(vendor.name),
        escapeCsv(EXPENSE_CATEGORY_LABELS[vendor.category]),
        vendor.ein_or_ssn_last4 ? `****${vendor.ein_or_ssn_last4}` : 'MISSING',
        vendor.is_corporation ? 'Yes' : 'No',
        (total_cents / 100).toFixed(2),
        'Yes',
      ].join(','))
    }
  }

  lines.push(``)
  lines.push(`DISCLAIMER: This report is a draft only. Not a tax filing. Consult a licensed CPA before filing.`)

  const csv = lines.join('\r\n')

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ar-year-end-${safeYear}.csv"`,
    },
  })
}
