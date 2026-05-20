// Shared email rendering for the Supabase edge functions.
//
// The Astro web app uses React Email-style components (rendered via
// react-dom/server). React DOM does not run in Deno's edge runtime without
// extra plumbing, so we keep parity here by producing identical HTML using
// template literals. If the look-and-feel diverges, update both this file and
// `apps/web/src/lib/email-templates/`.

export interface ManagerNotificationArgs {
  type: 'maintenance' | 'showing'
  ref_id: string
  building_name: string
  details: Record<string, string>
  studio_url: string
  is_emergency?: boolean
}

export interface SubmitterConfirmationArgs {
  type: 'maintenance' | 'showing'
  ref_id: string
  recipient_name: string
}

export interface DigestItem {
  kind: 'maintenance_request' | 'showing_request' | 'system'
  ref_id?: string
  title: string
  summary: string
  created_at: string
  studio_url?: string
}

export interface BatchedDigestArgs {
  recipient_email: string
  items: DigestItem[]
  generated_at: string
}

export interface Rendered {
  subject: string
  html: string
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function renderManagerNotification(a: ManagerNotificationArgs): Rendered {
  const prefix = a.is_emergency ? '[EMERGENCY] ' : ''
  const subject = `${prefix}[AR Management] New ${a.type} request — ${a.building_name} #${a.ref_id}`
  const banner = a.is_emergency
    ? `<p style="background:#fee2e2;border:1px solid #fecaca;padding:8px 12px;border-radius:6px;color:#991b1b;font-weight:600">EMERGENCY — please respond immediately.</p>`
    : ''
  const rows = Object.entries(a.details)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 8px;font-weight:600">${esc(k)}</td><td style="padding:4px 8px">${esc(v)}</td></tr>`,
    )
    .join('')
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">${banner}<h2>New ${esc(a.type)} request</h2><p><strong>${esc(a.building_name)}</strong> — <code>${esc(a.ref_id)}</code></p><table style="border-collapse:collapse;border:1px solid #ddd;width:100%"><tbody>${rows}</tbody></table><p style="margin-top:24px"><a href="${esc(a.studio_url)}" style="background:#111;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block">Open in Supabase</a></p></body></html>`
  return { subject, html }
}

export function renderSubmitterConfirmation(a: SubmitterConfirmationArgs): Rendered {
  const subject = `We received your ${a.type} request — AR Management`
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111"><h2>Thanks, ${esc(a.recipient_name)}!</h2><p>We received your ${esc(a.type)} request. Your reference is <code>${esc(a.ref_id)}</code>.</p><p>A property manager will follow up within one business day.</p><p>— AR Management</p></body></html>`
  return { subject, html }
}

export function renderBatchedDigest(a: BatchedDigestArgs): Rendered {
  const subject = `[AR Management] Digest — ${a.items.length} new ${a.items.length === 1 ? 'item' : 'items'}`
  const cards = a.items
    .map((item) => {
      const kindLabel =
        item.kind === 'maintenance_request'
          ? 'Maintenance'
          : item.kind === 'showing_request'
            ? 'Showing'
            : 'System'
      const ref = item.ref_id ? ` — #${esc(item.ref_id)}` : ''
      const link = item.studio_url
        ? `<p style="margin:8px 0 0;font-size:13px"><a href="${esc(item.studio_url)}">Open in Supabase →</a></p>`
        : ''
      return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px"><p style="font-size:16px;font-weight:600;margin:0 0 4px">${esc(item.title)}</p><p style="font-size:12px;color:#6b7280;margin:0 0 8px">${kindLabel}${ref} · ${esc(item.created_at)}</p><p style="margin:0;font-size:14px">${esc(item.summary)}</p>${link}</div>`
    })
    .join('')
  const itemsWord = a.items.length === 1 ? 'item' : 'items'
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111"><h2>Your AR Management digest</h2><p style="color:#374151">${a.items.length} new ${itemsWord} since the last digest.</p>${cards}<p style="font-size:12px;color:#6b7280;margin-top:24px">Generated ${esc(a.generated_at)}. Adjust your batching preferences in the admin notifications settings.</p></body></html>`
  return { subject, html }
}
