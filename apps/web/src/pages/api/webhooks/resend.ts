export const prerender = false
import type { APIRoute } from 'astro'
import { recordEmailEvent, type EmailEventInput } from '../../../lib/notifications'

// Resend posts events like:
//   { "type": "email.delivered", "created_at": "...", "data": { "email_id": "...", ... } }
// Optionally signed via the `svix-signature` / `resend-signature` header — for
// now we accept a shared-secret header `x-resend-secret` matched against
// RESEND_WEBHOOK_SECRET. If unset, we accept anything (dev mode).

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const KIND_MAP: Record<string, EmailEventInput['kind']> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complaint',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.delivery_delayed': 'delivery_delayed',
  'email.failed': 'failed',
}

export const POST: APIRoute = async ({ request, locals }) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    const presented = request.headers.get('x-resend-secret') ?? ''
    if (presented !== secret) return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const type = body.type as string | undefined
  const data = (body.data ?? {}) as Record<string, unknown>
  const kind = type ? KIND_MAP[type] : undefined
  if (!kind) {
    ;(locals as { log?: { warn: (msg: string) => void } }).log?.warn?.(
      `resend webhook: unknown event type ${String(type)}`,
    )
    return json({ ok: true, ignored: true })
  }

  const provider_message_id =
    (data.email_id as string | undefined) ??
    (data.id as string | undefined) ??
    null

  try {
    const res = await recordEmailEvent({ provider_message_id, kind, raw: body })
    if ('error' in res) {
      ;(locals as { log?: { error: (msg: string) => void } }).log?.error?.(
        `recordEmailEvent: ${res.error}`,
      )
      return json({ ok: false, error: res.error }, 500)
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
  return json({ ok: true })
}
