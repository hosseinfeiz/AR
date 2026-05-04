interface Args {
  type: 'maintenance' | 'showing'
  ref_id: string
  recipient_name: string
}

export function renderSubmitterConfirmation(a: Args): { subject: string; html: string } {
  const subject = `We received your ${a.type} request — AR Management`
  const html = `
    <!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2>Thanks, ${escapeHtml(a.recipient_name)}!</h2>
      <p>We received your ${a.type} request. Your reference is <code>${escapeHtml(a.ref_id)}</code>.</p>
      <p>A property manager will follow up within one business day.</p>
      <p>— AR Management</p>
    </body></html>`
  return { subject, html }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
