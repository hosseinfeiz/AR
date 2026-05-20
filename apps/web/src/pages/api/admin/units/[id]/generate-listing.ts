// POST /api/admin/units/:id/generate-listing
//
// Generates three SEO listing-copy variants for a unit using Claude. The
// admin can pass an optional `notes` field to nudge generation (e.g.
// "emphasize the garage"). The unit + building context is cached on the
// Anthropic side so re-runs with tweaked notes are cheap.
//
// Returns 200 { variants: [...] } even when ANTHROPIC_API_KEY is unset —
// in that case `variants` is an empty array and the UI renders a hint.
//
// Admin-session gated.

export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../../lib/auth'
import { units, buildings } from '../../../../../lib/fixtures'
import { aiCtx, generateListingCopy } from '../../../../../lib/ai-helpers'

interface BodyShape {
  notes?: string
}

export const POST: APIRoute = async ({ params, request, cookies, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }
  const unitId = params.id
  const unit = units.find((u) => u.id === unitId)
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

  let body: BodyShape = {}
  try {
    const raw = await request.text()
    body = raw ? (JSON.parse(raw) as BodyShape) : {}
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'notes must be a string' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const ctx = aiCtx({ locals })
  const variants = await generateListingCopy(ctx, {
    unit: {
      unit_number: unit.unit_number,
      bedrooms: unit.bedrooms,
      bathrooms: unit.bathrooms,
      sqft: unit.sqft,
      monthly_rent_cents: unit.monthly_rent_cents,
      available_from: unit.available_from,
      status: unit.status,
      description_md: unit.description_md,
    },
    building: {
      name: building.name,
      city: building.city,
      state: building.state,
      neighborhood_md: building.neighborhood_md,
      amenities: building.amenities,
      pet_policy: building.pet_policy,
    },
    photos: (unit.unit_photos ?? []).map((p) => ({
      alt_text: p.alt_text,
      storage_path: p.storage_path,
    })),
    notes: body.notes?.trim() || undefined,
  })

  return new Response(
    JSON.stringify({
      ok: true,
      variants,
      ai_enabled: Boolean(ctx.apiKey),
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}
