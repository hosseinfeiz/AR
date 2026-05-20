// Receives a maintenance request, generates a reference id, and emails the
// building's property manager with armgmt.co@gmail.com on CC.
//
// Email is sent via Resend (https://resend.com). When RESEND_API_KEY is
// unset (dev / first-time deploy), the request is logged and a mock ref_id
// is returned so the form still works end-to-end.

import { MaintenanceRequestInputSchema, generateRefId } from '@ar/shared'
import { buildings as fixBuildings } from '../../lib/fixtures'
import { apiHandler, badRequest, ok, respond } from '../../lib/api-handler'

export const prerender = false

const OWNER_CC_EMAIL = 'armgmt.co@gmail.com'
// Default sender used when RESEND_FROM_EMAIL isn't set. Resend's onboarding
// domain works without verifying a custom domain — fine for first-run; should
// be replaced with a verified domain (mail@armgmt.co or similar) for prod.
const DEFAULT_FROM_EMAIL = 'A & R Management <onboarding@resend.dev>'

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderEmail(args: {
  refId: string
  buildingName: string
  body: ReturnType<typeof MaintenanceRequestInputSchema.parse>
}): { subject: string; html: string; text: string } {
  const { refId, buildingName, body } = args

  const lines = [
    `Reference: ${refId}`,
    `Building: ${buildingName}`,
    `Unit: ${body.unit_number}`,
    `Tenant: ${body.tenant_name}`,
    `Email: ${body.tenant_email ?? '—'}`,
    `Phone: ${body.tenant_phone ?? '—'}`,
    `Issue: ${body.issue_type}`,
    `Urgency: ${body.urgency}`,
    '',
    'Description:',
    body.description,
    ...(body.photo_paths.length > 0
      ? ['', `Photos: ${body.photo_paths.length} attached (paths: ${body.photo_paths.join(', ')})`]
      : []),
  ]
  const text = lines.join('\n')

  const subject =
    body.urgency === 'emergency'
      ? `[EMERGENCY] Maintenance — ${buildingName} #${body.unit_number} (${refId})`
      : `Maintenance — ${buildingName} #${body.unit_number} (${refId})`

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;">
  <h2 style="margin:0 0 8px">Maintenance request</h2>
  <p style="color:#666;margin:0 0 16px">Reference <strong>${escapeHtml(refId)}</strong></p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><td style="padding:4px 0;color:#666;width:120px">Building</td><td>${escapeHtml(buildingName)}</td></tr>
    <tr><td style="padding:4px 0;color:#666">Unit</td><td>${escapeHtml(body.unit_number)}</td></tr>
    <tr><td style="padding:4px 0;color:#666">Tenant</td><td>${escapeHtml(body.tenant_name)}</td></tr>
    <tr><td style="padding:4px 0;color:#666">Email</td><td>${escapeHtml(body.tenant_email ?? '—')}</td></tr>
    <tr><td style="padding:4px 0;color:#666">Phone</td><td>${escapeHtml(body.tenant_phone ?? '—')}</td></tr>
    <tr><td style="padding:4px 0;color:#666">Issue</td><td>${escapeHtml(body.issue_type)}</td></tr>
    <tr><td style="padding:4px 0;color:#666">Urgency</td><td><strong>${escapeHtml(body.urgency)}</strong></td></tr>
  </table>
  <h3 style="margin:16px 0 4px">Description</h3>
  <p style="white-space:pre-wrap;margin:0">${escapeHtml(body.description)}</p>
  ${body.photo_paths.length > 0 ? `<p style="color:#666;font-size:13px;margin-top:16px">${body.photo_paths.length} photo(s) attached. Paths: ${body.photo_paths.map(escapeHtml).join(', ')}</p>` : ''}
</body></html>`

  return { subject, html, text }
}

async function sendViaResend(args: {
  apiKey: string
  from: string
  to: string[]
  cc: string[]
  replyTo?: string
  subject: string
  html: string
  text: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: args.from,
        to: args.to,
        cc: args.cc,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      return { ok: false, error: `Resend ${res.status}: ${errBody}` }
    }
    const data = (await res.json()) as { id?: string }
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export const POST = apiHandler(MaintenanceRequestInputSchema, async (data, { locals }) => {
  const building = fixBuildings.find((b) => b.id === data.building_id)
  if (!building || !building.contact_email) {
    return badRequest('Unknown building', 'UNKNOWN_BUILDING')
  }

  const refId = generateRefId()
  const env = envFor(locals)
  const apiKey = env.RESEND_API_KEY
  const fromEmail = env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL

  const { subject, html, text } = renderEmail({
    refId,
    buildingName: building.name,
    body: data,
  })

  if (!apiKey) {
    // Resend not yet configured — surface the request in logs and accept it.
    // eslint-disable-next-line no-console
    console.log('[maintenance] RESEND_API_KEY not set; logging request only', {
      refId, building: building.name, manager: building.contact_email, cc: OWNER_CC_EMAIL, subject,
    })
    return ok({ ref_id: refId, emailed: false })
  }

  const result = await sendViaResend({
    apiKey,
    from: fromEmail,
    to: [building.contact_email],
    cc: [OWNER_CC_EMAIL],
    replyTo: data.tenant_email ?? undefined,
    subject, html, text,
  })

  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error('[maintenance] email send failed', { refId, error: result.error })
    return respond(
      { ok: false, error: 'Failed to deliver email', code: 'EMAIL_SEND_FAILED', ref_id: refId },
      502,
    )
  }

  return ok({ ref_id: refId, emailed: true })
})
