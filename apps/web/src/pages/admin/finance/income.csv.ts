export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { payments, charges, tenants } from '../../../lib/tenant-fixtures'
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
  const filterFrom = url.searchParams.get('from') ?? ''
  const filterTo = url.searchParams.get('to') ?? ''

  // Build charge → building_id map
  const chargeBuildingMap = new Map<string, string>()
  for (const t of tenants) {
    const tenantCharges = charges.filter((c) => c.tenant_id === t.id)
    for (const c of tenantCharges) {
      chargeBuildingMap.set(c.id, t.building_id)
    }
  }

  const rows = payments
    .filter((p) => {
      const date = p.paid_at.slice(0, 10)
      if (filterFrom && date < filterFrom) return false
      if (filterTo && date > filterTo) return false
      const bId = chargeBuildingMap.get(p.charge_id) ?? ''
      if (filterBuilding && bId !== filterBuilding) return false
      return true
    })
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))

  const lines: string[] = [
    ['Date', 'Tenant', 'Building', 'Unit', 'Amount USD', 'Method', 'Receipt #'].join(','),
  ]

  for (const p of rows) {
    const tenant = tenants.find((t) => t.id === p.tenant_id)
    const bId = chargeBuildingMap.get(p.charge_id) ?? ''
    const building = buildings.find((b) => b.id === bId)
    lines.push([
      fmtCsvDate(p.paid_at.slice(0, 10)),
      escapeCsv(tenant?.name ?? ''),
      escapeCsv(building?.name ?? ''),
      escapeCsv(tenant?.unit_label ?? ''),
      (p.amount_cents / 100).toFixed(2),
      p.method.toUpperCase(),
      p.receipt_number,
    ].join(','))
  }

  const csv = lines.join('\r\n')

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ar-income.csv"',
    },
  })
}
