export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import {
  listExpenses,
  findVendorById,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from '../../../lib/finance-fixtures'
import { buildings } from '../../../lib/fixtures'

function fmtCsvDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC',
  })
}

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
  const filterBuilding = url.searchParams.get('building') ?? ''
  const filterCategory = (url.searchParams.get('category') ?? '') as ExpenseCategory | ''
  const filterFrom = url.searchParams.get('from') ?? ''
  const filterTo = url.searchParams.get('to') ?? ''

  const rows = listExpenses({
    building_id: filterBuilding || undefined,
    from: filterFrom || undefined,
    to: filterTo || undefined,
    category: filterCategory || undefined,
  }).sort((a, b) => b.expense_date.localeCompare(a.expense_date))

  const lines: string[] = [
    ['Date', 'Building', 'Category', 'Vendor', 'Amount USD', 'Status', 'Method', 'Receipt #', 'Description', 'Notes'].join(','),
  ]

  for (const e of rows) {
    const building = buildings.find((b) => b.id === e.building_id)
    const vendor = e.vendor_id ? findVendorById(e.vendor_id) : null
    lines.push([
      fmtCsvDate(e.expense_date),
      escapeCsv(building?.name ?? ''),
      escapeCsv(EXPENSE_CATEGORY_LABELS[e.category]),
      escapeCsv(vendor?.name ?? ''),
      (e.amount_cents / 100).toFixed(2),
      e.status,
      e.payment_method.toUpperCase(),
      escapeCsv(e.receipt_number ?? ''),
      escapeCsv(e.description),
      escapeCsv(e.notes ?? ''),
    ].join(','))
  }

  const csv = lines.join('\r\n')

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ar-expenses.csv"',
    },
  })
}
