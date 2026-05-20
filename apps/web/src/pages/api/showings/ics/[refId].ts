// GET /api/showings/ics/[refId]?token=...
//
// Returns the ICS file for a confirmed showing. No login required, but the token
// must match the showing's stored reschedule_token_hash — that way the link from
// the confirmation email works, but random crawlers can't dump booking details.

import type { APIRoute } from 'astro'
import { getShowingByRefId, tokenHashFor, verifyRescheduleToken, type VerifiedToken, type VerifyFailure } from '../../../../lib/showings'
import { buildIcs } from '../../../../lib/ics'
import { buildings as fixBuildings } from '../../../../lib/fixtures'

export const prerender = false

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const refId = (params as { refId?: string }).refId
  const token = url.searchParams.get('token') ?? ''
  if (!refId || !token) {
    return new Response('Missing ref or token', { status: 400 })
  }
  const env = envFor(locals)

  const v: VerifiedToken | VerifyFailure = await verifyRescheduleToken(token, env)
    .catch((): VerifyFailure => ({ ok: false, reason: 'bad_signature' }))
  if (!v.ok) return new Response('Token invalid', { status: 401 })
  if (v.refId !== refId) return new Response('Token ref mismatch', { status: 401 })

  const showing = await getShowingByRefId(refId).catch(() => null)
  if (!showing || !showing.scheduled_at) return new Response('Not found', { status: 404 })

  const hash = await tokenHashFor(token)
  if (showing.reschedule_token_hash !== hash) {
    return new Response('Token superseded', { status: 410 })
  }

  const start = new Date(showing.scheduled_at)
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  const fxBuilding = fixBuildings.find((b) => b.id === showing.building_id)
  const buildingName = fxBuilding?.name ?? 'A & R Management'

  const ics = buildIcs({
    uid: `showing-${refId}@armgmt.co`,
    start, end,
    summary: `Showing — ${buildingName}`,
    description: `Showing for ${showing.prospect_name}. Reference ${refId}.`,
    location: fxBuilding ? `${fxBuilding.address_line1}, ${fxBuilding.city}, ${fxBuilding.state}` : undefined,
    attendeeEmail: showing.prospect_email,
    attendeeName: showing.prospect_name,
  })

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="showing-${refId}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
