// GET /api/admin/units/:id/rent-comp
//
// Returns the market-rent range for a unit. Backed by Rentometer when
// RENTOMETER_API_KEY is set; otherwise returns a mock fallback so the UI
// keeps working. The response always carries a `source` field so the
// caller can label the data appropriately.
//
// Admin-session gated.

export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../../lib/auth'
import { units, buildings } from '../../../../../lib/fixtures'
import { fetchRentComp, rentCompCtx, summarizeRentComp } from '../../../../../lib/rent-comp'

export const GET: APIRoute = async ({ params, cookies, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }
  const unit = units.find((u) => u.id === params.id)
  if (!unit) {
    return new Response(JSON.stringify({ ok: false, error: 'Unit not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }
  const building = buildings.find((b) => b.id === unit.building_id)
  if (!building) {
    return new Response(JSON.stringify({ ok: false, error: 'Building not found' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  const ctx = rentCompCtx({ locals })
  const comp = await fetchRentComp(ctx, {
    address: building.address_line1,
    city: building.city,
    state: building.state,
    postal_code: building.postal_code,
    bedrooms: unit.bedrooms,
    unit_rent_cents: unit.monthly_rent_cents,
  })

  return new Response(
    JSON.stringify({
      ok: true,
      rent_comp: comp,
      summary: summarizeRentComp(comp),
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Cache for a few minutes — Rentometer data doesn't change quickly.
        'cache-control': 'private, max-age=300',
      },
    },
  )
}
