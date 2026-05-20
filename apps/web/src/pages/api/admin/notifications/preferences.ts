export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../../lib/auth'
import {
  getManagerPreferences,
  upsertManagerPreferences,
  DEFAULT_PREFS,
  type ManagerPreferences,
} from '../../../../lib/notifications'

// In mock-auth mode, the session is just `{ type: 'admin' }` with no email.
// For preferences we use a "current manager email" header or fall back to a
// well-known admin email used in development.
const FALLBACK_MANAGER_EMAIL = 'admin@ar-management.example'

function currentManagerEmail(request: Request): string {
  const headerEmail = request.headers.get('x-manager-email')
  if (headerEmail && headerEmail.includes('@')) return headerEmail
  return FALLBACK_MANAGER_EMAIL
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function isHHMM(v: unknown): v is string {
  return typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v)
}

export const GET: APIRoute = async ({ cookies, request, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return json({ ok: false, error: 'Forbidden' }, 403)
  }
  const email = currentManagerEmail(request)
  let prefs: ManagerPreferences | null = null
  try {
    prefs = await getManagerPreferences(email)
  } catch (e) {
    ;(locals as { log?: { warn: (msg: string) => void } }).log?.warn?.(
      `getManagerPreferences failed: ${(e as Error).message}`,
    )
  }
  return json({ ok: true, prefs: prefs ?? { ...DEFAULT_PREFS, manager_email: email } })
}

export const PATCH: APIRoute = async ({ cookies, request, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return json({ ok: false, error: 'Forbidden' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const email = currentManagerEmail(request)

  const next: ManagerPreferences = { ...DEFAULT_PREFS, manager_email: email }
  try {
    const current = await getManagerPreferences(email)
    if (current) Object.assign(next, current)
  } catch {
    // ignore — start from defaults
  }
  next.manager_email = email

  const errs: string[] = []

  if ('quiet_hours_start' in body) {
    const v = body.quiet_hours_start
    if (v === null || v === '') next.quiet_hours_start = null
    else if (isHHMM(v)) next.quiet_hours_start = v
    else errs.push('quiet_hours_start must be HH:MM or null.')
  }
  if ('quiet_hours_end' in body) {
    const v = body.quiet_hours_end
    if (v === null || v === '') next.quiet_hours_end = null
    else if (isHHMM(v)) next.quiet_hours_end = v
    else errs.push('quiet_hours_end must be HH:MM or null.')
  }
  if ('batch_after_count' in body) {
    const v = body.batch_after_count
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 50) {
      next.batch_after_count = v
    } else {
      errs.push('batch_after_count must be an integer between 1 and 50.')
    }
  }
  if ('filters' in body) {
    const v = body.filters
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      next.filters = v as Record<string, unknown>
    } else {
      errs.push('filters must be an object.')
    }
  }

  if (errs.length > 0) return json({ ok: false, error: errs.join(' ') }, 400)

  try {
    const res = await upsertManagerPreferences(next)
    if ('error' in res) {
      ;(locals as { log?: { error: (msg: string) => void } }).log?.error?.(
        `upsertManagerPreferences: ${res.error}`,
      )
      return json({ ok: false, error: res.error }, 500)
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
  return json({ ok: true, prefs: next })
}
