interface Args {
  type: 'maintenance' | 'showing'
  ref_id: string
  building_name: string
  details: Record<string, string>
  studio_url: string
}

export function renderManagerNotification(a: Args): { subject: string; html: string } {
  const prefix = a.details.urgency === 'emergency' ? '[EMERGENCY] ' : ''
  const subject = `${prefix}[AR Management] New ${a.type} request — ${a.building_name} #${a.ref_id}`
  const rows = Object.entries(a.details)
    .map(([k, v]) => `<tr><td style="padding:4px 8px;font-weight:600">${escapeHtml(k)}</td><td style="padding:4px 8px">${escapeHtml(v)}</td></tr>`)
    .join('')
  const html = `
    <!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2>New ${a.type} request</h2>
      <p><strong>${escapeHtml(a.building_name)}</strong> — <code>${escapeHtml(a.ref_id)}</code></p>
      <table style="border-collapse:collapse;border:1px solid #ddd;width:100%">${rows}</table>
      <p style="margin-top:24px"><a href="${escapeAttr(a.studio_url)}" style="background:#111;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;display:inline-block">Open in Supabase</a></p>
    </body></html>`
  return { subject, html }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
function escapeAttr(s: string) { return escapeHtml(s) }
