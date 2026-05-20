export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../lib/auth'
import { inAppMarkRead } from '../../../../lib/notifications'

const FALLBACK_MANAGER_EMAIL = 'admin@ar-management.example'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function currentManagerEmail(request: Request): string {
  const headerEmail = request.headers.get('x-manager-email')
  if (headerEmail && headerEmail.includes('@')) return headerEmail
  return FALLBACK_MANAGER_EMAIL
}

export const POST: APIRoute = async ({ cookies, request, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') return json({ ok: false, error: 'Forbidden' }, 403)

  let body: { id?: unknown }
  try {
    body = (await request.json()) as { id?: unknown }
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const id = body.id
  if (typeof id !== 'string' || id.length === 0) {
    return json({ ok: false, error: 'id required' }, 400)
  }

  const email = currentManagerEmail(request)

  try {
    const res = await inAppMarkRead({ id, recipient_email: email })
    if ('error' in res) {
      ;(locals as { log?: { error: (msg: string) => void } }).log?.error?.(
        `inAppMarkRead: ${res.error}`,
      )
      return json({ ok: false, error: res.error }, 500)
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
  return json({ ok: true })
}
