// POST /api/showings/reschedule
//
// Body: { ref, token, new_slot_start (ISO), new_slot_end (ISO) }
//
// 1. Verify the HMAC token.
// 2. Look up the showing by ref_id; ensure the stored hash matches the supplied token.
// 3. Update scheduled_at and rotate the reschedule_token_hash (so old links are dead).
// 4. Send a "rescheduled" confirmation email with a fresh ICS attachment.
//
// GET form (link click from email): renders a tiny HTML page so the prospect can
// review their existing time and submit a new one. Keeps the flow public + token-gated.

import type { APIRoute } from 'astro'
import { getShowingByRefId, issueRescheduleToken, setShowingScheduledAt, tokenHashFor, verifyRescheduleToken, type VerifiedToken, type VerifyFailure } from '../../../lib/showings'
import { icsAttachment } from '../../../lib/ics'
import { buildings as fixBuildings } from '../../../lib/fixtures'

export const prerender = false

interface RescheduleInput {
  ref: string
  token: string
  new_slot_start: string
  new_slot_end: string
}

function validateRescheduleInput(b: unknown): { ok: true; value: RescheduleInput } | { ok: false; error: string } {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Body must be an object' }
  const o = b as Record<string, unknown>
  if (typeof o.ref !== 'string' || o.ref.length < 4) return { ok: false, error: 'ref required' }
  if (typeof o.token !== 'string' || o.token.length < 8) return { ok: false, error: 'token required' }
  if (typeof o.new_slot_start !== 'string' || Number.isNaN(Date.parse(o.new_slot_start))) return { ok: false, error: 'new_slot_start invalid' }
  if (typeof o.new_slot_end !== 'string' || Number.isNaN(Date.parse(o.new_slot_end))) return { ok: false, error: 'new_slot_end invalid' }
  return { ok: true, value: o as unknown as RescheduleInput }
}

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

// GET: a minimal landing page. The token is already in the query string.
export const GET: APIRoute = async ({ url, locals }) => {
  const ref = url.searchParams.get('ref') ?? ''
  const token = url.searchParams.get('token') ?? ''
  const env = envFor(locals)

  const v: VerifiedToken | VerifyFailure = await verifyRescheduleToken(token, env)
    .catch((): VerifyFailure => ({ ok: false, reason: 'bad_signature' }))
  if (!v.ok) {
    return new Response(`<!doctype html><h1>Link expired or invalid</h1><p>Please contact us to reschedule.</p>`, {
      status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  let showing: Awaited<ReturnType<typeof getShowingByRefId>> = null
  try { showing = await getShowingByRefId(ref) } catch { /* ignore */ }
  if (!showing) {
    return new Response(`<!doctype html><h1>Booking not found</h1><p>Reference ${escapeHtml(ref)} was not found.</p>`, {
      status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  const expectedHash = await tokenHashFor(token)
  if (showing.reschedule_token_hash !== expectedHash) {
    return new Response(`<!doctype html><h1>Link superseded</h1><p>A newer reschedule link was issued.</p>`, {
      status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const cur = showing.scheduled_at ? new Date(showing.scheduled_at).toLocaleString() : '—'
  // Minimal form. The script POSTs back to this same endpoint with JSON.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Reschedule</title></head>
    <body style="font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;">
    <h1>Reschedule your showing</h1>
    <p>Current time: <strong>${escapeHtml(cur)}</strong> (ref ${escapeHtml(ref)}).</p>
    <form id="f" style="display:flex;flex-direction:column;gap:10px;max-width:300px">
      <label>New date/time<input name="dt" type="datetime-local" required></label>
      <button type="submit" style="padding:8px 12px;background:#111;color:#fff;border:0;border-radius:6px">Reschedule</button>
    </form>
    <p id="out" style="margin-top:16px"></p>
    <script>
      const f = document.getElementById('f');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dt = new Date(f.dt.value);
        const end = new Date(dt.getTime() + 30*60*1000);
        const res = await fetch(location.pathname + location.search, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            ref: ${JSON.stringify(ref)},
            token: ${JSON.stringify(token)},
            new_slot_start: dt.toISOString(),
            new_slot_end: end.toISOString(),
          }),
        });
        const j = await res.json().catch(() => ({}));
        document.getElementById('out').textContent = res.ok ? 'Rescheduled! Check your email.' : ('Error: ' + (j.error || res.status));
      });
    </script>
    </body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const parsed = validateRescheduleInput(body)
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
  const data = parsed.value
  const env = envFor(locals)

  const v = await verifyRescheduleToken(data.token, env)
  if (!v.ok) {
    return new Response(JSON.stringify({ error: `Token ${v.reason}` }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }
  if (v.refId !== data.ref) {
    return new Response(JSON.stringify({ error: 'Token ref mismatch' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }
  const showing = await getShowingByRefId(data.ref).catch(() => null)
  if (!showing) {
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }
  const hash = await tokenHashFor(data.token)
  if (showing.reschedule_token_hash !== hash) {
    return new Response(JSON.stringify({ error: 'Token superseded' }), {
      status: 410, headers: { 'Content-Type': 'application/json' },
    })
  }

  const newStart = new Date(data.new_slot_start)
  const newEnd = new Date(data.new_slot_end)
  if (newEnd <= newStart) {
    return new Response(JSON.stringify({ error: 'Invalid new slot' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
  if (newStart.getTime() < Date.now()) {
    return new Response(JSON.stringify({ error: 'New time is in the past' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Rotate token + write new scheduled_at.
  const { token: newToken, hash: newHash } = await issueRescheduleToken(data.ref, env)
  try {
    await setShowingScheduledAt(data.ref, newStart, newHash)
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Update failed', detail: (e as Error).message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Send updated confirmation.
  const fxBuilding = fixBuildings.find((b) => b.id === showing.building_id)
  const buildingName = fxBuilding?.name ?? 'A & R Management'
  const attachment = icsAttachment(`showing-${data.ref}.ics`, {
    uid: `showing-${data.ref}@armgmt.co`,
    start: newStart, end: newEnd,
    summary: `Showing — ${buildingName} (rescheduled)`,
    description: `Your showing was moved to a new time.`,
    location: fxBuilding ? `${fxBuilding.address_line1}, ${fxBuilding.city}, ${fxBuilding.state}` : undefined,
    attendeeEmail: showing.prospect_email,
    attendeeName: showing.prospect_name,
  })

  const apiKey = env.RESEND_API_KEY
  const fromEmail = env.RESEND_FROM_EMAIL || 'A & R Management <onboarding@resend.dev>'
  let emailed = false
  if (apiKey) {
    const origin = (() => {
      if (env.PUBLIC_SITE_URL) return env.PUBLIC_SITE_URL
      try { const u = new URL(request.url); return `${u.protocol}//${u.host}` } catch { return '' }
    })()
    const rescheduleUrl = `${origin}/api/showings/reschedule?ref=${encodeURIComponent(data.ref)}&token=${encodeURIComponent(newToken)}`
    const startLocal = newStart.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
    const subject = `Showing rescheduled — ${buildingName} (${data.ref})`
    const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;">
      <h2>Showing rescheduled</h2>
      <p>Your new time: <strong>${escapeHtml(startLocal)}</strong></p>
      <p><a href="${rescheduleUrl}">Need to change again?</a></p>
      <p style="color:#888;font-size:12px">Reference ${escapeHtml(data.ref)}</p>
    </body></html>`
    const text = `Showing rescheduled to ${startLocal}. Ref: ${data.ref}. Reschedule: ${rescheduleUrl}`
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [showing.prospect_email],
          subject, html, text,
          attachments: [attachment],
        }),
      })
      emailed = res.ok
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[reschedule] email failed', (e as Error).message)
    }
  }

  return new Response(JSON.stringify({ ok: true, scheduled_at: newStart.toISOString(), emailed }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
