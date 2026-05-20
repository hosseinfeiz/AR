// POST /api/showings/book
//
// Body: {
//   building_id, unit_id?, prospect_name, prospect_email, prospect_phone?,
//   message?, source, slot_start (ISO), slot_end (ISO), turnstile_token
// }
//
// 1. Insert a `showing_requests` row with status='scheduled' + scheduled_at=slot_start.
// 2. Issue a reschedule token, store its hash on the row.
// 3. Send a confirmation email with an ICS attachment + reschedule link.
// 4. Best-effort: insert the event into each connected manager's Google Calendar.
// 5. Best-effort: SMS the prospect if Twilio is configured + phone provided.

import type { APIRoute } from 'astro'
import { generateRefId } from '@ar/shared'
import { getAdminClient } from '../../../lib/supabase-admin'
import { issueRescheduleToken } from '../../../lib/showings'
import { icsAttachment } from '../../../lib/ics'
import { sendSms } from '../../../lib/twilio'
import { buildings as fixBuildings } from '../../../lib/fixtures'
import { insertEvent, refreshAccessToken } from '../../../lib/google-calendar'

export const prerender = false

const OWNER_CC_EMAIL = 'armgmt.co@gmail.com'
const DEFAULT_FROM_EMAIL = 'A & R Management <onboarding@resend.dev>'

interface BookInput {
  building_id: string
  unit_id?: string | null
  prospect_name: string
  prospect_email: string
  prospect_phone?: string | null
  message?: string | null
  source: 'web' | 'ios' | 'android'
  slot_start: string
  slot_end: string
  turnstile_token: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateBookInput(b: unknown): { ok: true; value: BookInput } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Body must be an object' }
  const o = b as Record<string, unknown>
  if (typeof o.building_id !== 'string' || !UUID_RE.test(o.building_id)) return { ok: false, error: 'building_id must be a UUID' }
  if (o.unit_id != null && (typeof o.unit_id !== 'string' || !UUID_RE.test(o.unit_id))) return { ok: false, error: 'unit_id must be a UUID' }
  if (typeof o.prospect_name !== 'string' || o.prospect_name.length < 1 || o.prospect_name.length > 120) return { ok: false, error: 'prospect_name required' }
  if (typeof o.prospect_email !== 'string' || !EMAIL_RE.test(o.prospect_email)) return { ok: false, error: 'prospect_email invalid' }
  if (o.prospect_phone != null && typeof o.prospect_phone !== 'string') return { ok: false, error: 'prospect_phone must be a string' }
  if (o.message != null && (typeof o.message !== 'string' || o.message.length > 2000)) return { ok: false, error: 'message too long' }
  if (o.source !== 'web' && o.source !== 'ios' && o.source !== 'android') return { ok: false, error: 'source invalid' }
  if (typeof o.slot_start !== 'string' || Number.isNaN(Date.parse(o.slot_start))) return { ok: false, error: 'slot_start invalid' }
  if (typeof o.slot_end !== 'string' || Number.isNaN(Date.parse(o.slot_end))) return { ok: false, error: 'slot_end invalid' }
  if (typeof o.turnstile_token !== 'string' || o.turnstile_token.length < 1) return { ok: false, error: 'turnstile_token required' }
  return { ok: true, value: o as unknown as BookInput }
}

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function siteOriginFromRequest(req: Request, env: Record<string, string | undefined>): string {
  if (env.PUBLIC_SITE_URL) return env.PUBLIC_SITE_URL
  try {
    const u = new URL(req.url)
    return `${u.protocol}//${u.host}`
  } catch {
    return 'https://ar-management.example'
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const parsed = validateBookInput(body)
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
  const data = parsed.value
  const start = new Date(data.slot_start)
  const end = new Date(data.slot_end)
  if (Number.isNaN(start.getTime()) || end <= start) {
    return new Response(JSON.stringify({ error: 'Invalid slot range' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const env = envFor(locals)
  const refId = generateRefId()
  const { token, hash } = await issueRescheduleToken(refId, env)

  // Re-resolve building name from fixtures (works in mock mode and as a fallback if DB lacks the row).
  const fxBuilding = fixBuildings.find((b) => b.id === data.building_id)

  // Insert the showing.
  let inserted = false
  try {
    const admin = getAdminClient()
    const { error } = await admin.from('showing_requests').insert({
      ref_id: refId,
      building_id: data.building_id,
      unit_id: data.unit_id ?? null,
      slot_id: null,
      prospect_name: data.prospect_name,
      prospect_email: data.prospect_email,
      prospect_phone: data.prospect_phone ?? null,
      preferred_dates: null,
      message: data.message ?? null,
      source: data.source,
      status: 'scheduled',
      scheduled_at: start.toISOString(),
      reschedule_token_hash: hash,
    })
    if (error) throw error
    inserted = true
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[book] insert failed', (e as Error).message)
  }

  // Build calendar payload.
  const buildingName = fxBuilding?.name ?? 'A & R Management'
  const ev = {
    uid: `showing-${refId}@armgmt.co`,
    start, end,
    summary: `Showing — ${buildingName}`,
    description: data.message ?? `Showing for ${data.prospect_name}.`,
    location: fxBuilding ? `${fxBuilding.address_line1}, ${fxBuilding.city}, ${fxBuilding.state}` : undefined,
    organizerEmail: fxBuilding?.contact_email ?? OWNER_CC_EMAIL,
    organizerName: 'A & R Management',
    attendeeEmail: data.prospect_email,
    attendeeName: data.prospect_name,
  }
  const attachment = icsAttachment(`showing-${refId}.ics`, ev)

  const origin = siteOriginFromRequest(request, env)
  const rescheduleUrl = `${origin}/api/showings/reschedule?ref=${encodeURIComponent(refId)}&token=${encodeURIComponent(token)}`
  const icsUrl = `${origin}/api/showings/ics/${refId}?token=${encodeURIComponent(token)}`
  const startLocal = start.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZoneName: 'short',
  })

  // Confirmation email — Resend with ICS attachment.
  let emailed = false
  const apiKey = env.RESEND_API_KEY
  const fromEmail = env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL
  if (apiKey) {
    const subject = `Showing confirmed — ${buildingName} (${refId})`
    const text = [
      `Hi ${data.prospect_name},`,
      ``,
      `Your showing is confirmed: ${startLocal}.`,
      `Building: ${buildingName}`,
      fxBuilding ? `Address: ${fxBuilding.address_line1}, ${fxBuilding.city}, ${fxBuilding.state}` : '',
      ``,
      `Reschedule: ${rescheduleUrl}`,
      `Calendar (.ics): ${icsUrl}`,
      ``,
      `Reference: ${refId}`,
    ].filter(Boolean).join('\n')

    const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;">
      <h2 style="margin:0 0 8px">Showing confirmed</h2>
      <p>Hi ${escapeHtml(data.prospect_name)},</p>
      <p>We've got you down for <strong>${escapeHtml(startLocal)}</strong> at <strong>${escapeHtml(buildingName)}</strong>.</p>
      ${fxBuilding ? `<p style="color:#555">${escapeHtml(fxBuilding.address_line1)}, ${escapeHtml(fxBuilding.city)}, ${escapeHtml(fxBuilding.state)}</p>` : ''}
      <p>The attached .ics file will add it to your calendar.</p>
      <p>Need a different time? <a href="${rescheduleUrl}">Reschedule here</a>.</p>
      <p style="color:#888;font-size:12px;margin-top:24px">Reference ${escapeHtml(refId)}</p>
    </body></html>`

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [data.prospect_email],
          cc: fxBuilding?.contact_email ? [fxBuilding.contact_email, OWNER_CC_EMAIL] : [OWNER_CC_EMAIL],
          subject, html, text,
          attachments: [attachment],
        }),
      })
      emailed = res.ok
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn('[book] Resend send failed', res.status, await res.text())
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[book] Resend exception', (e as Error).message)
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('[book] RESEND_API_KEY not set; skipping confirmation email', { refId })
  }

  // Best-effort: push the event into manager calendars (so they see the booking).
  try {
    const admin = getAdminClient()
    const { data: conns } = await admin
      .from('manager_calendar_connections')
      .select('google_refresh_token, calendar_id')
      .limit(5)
    for (const conn of conns ?? []) {
      try {
        const { access_token } = await refreshAccessToken(conn.google_refresh_token as string, env)
        await insertEvent({
          accessToken: access_token,
          calendarId: (conn.calendar_id as string) || 'primary',
          summary: ev.summary,
          description: `${ev.description ?? ''}\nProspect: ${data.prospect_email}\nRef: ${refId}`,
          startISO: start.toISOString(),
          endISO: end.toISOString(),
          attendeeEmail: data.prospect_email,
          attendeeName: data.prospect_name,
        })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[book] Google insertEvent failed for one connection', (e as Error).message)
      }
    }
  } catch {
    // No connections / no admin client.
  }

  // Best-effort: SMS the prospect.
  if (data.prospect_phone) {
    await sendSms(
      { to: data.prospect_phone, body: `${buildingName}: showing confirmed for ${startLocal}. Reschedule: ${rescheduleUrl}` },
      env,
    )
  }

  return new Response(
    JSON.stringify({ ref_id: refId, scheduled_at: start.toISOString(), inserted, emailed }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
