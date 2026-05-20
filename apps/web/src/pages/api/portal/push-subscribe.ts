// POST /api/portal/push-subscribe
//
// Stores a tenant's Web Push subscription. Auth: tenant cookie session.
// Body: { endpoint, keys: { p256dh, auth } }
//
// Idempotent on `endpoint` (the push service URL is globally unique). Re-posting
// the same endpoint updates the keys + re-associates with the current tenant.

export const prerender = false

import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { getAdminClient } from '../../../lib/supabase-admin'

interface SubscribeBody {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'tenant') {
    return json(401, { ok: false, error: 'Unauthorized' })
  }

  let body: SubscribeBody
  try {
    body = (await request.json()) as SubscribeBody
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON' })
  }

  const endpoint = body.endpoint
  const p256dh = body.keys?.p256dh
  const auth = body.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return json(400, { ok: false, error: 'endpoint, keys.p256dh, keys.auth required' })
  }

  let admin
  try {
    admin = getAdminClient()
  } catch (e) {
    // Supabase not configured (dev) — accept the subscription so the UI flow
    // works; nothing to persist.
    // eslint-disable-next-line no-console
    console.warn('[push-subscribe] Supabase not configured', (e as Error).message)
    return json(200, { ok: true, persisted: false })
  }

  const { error } = await admin
    .from('push_subscriptions')
    .upsert(
      {
        tenant_id: session.tenantId,
        endpoint,
        p256dh,
        auth_token: auth,
      },
      { onConflict: 'endpoint' },
    )

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[push-subscribe] upsert failed', error)
    return json(500, { ok: false, error: 'Failed to save subscription' })
  }

  return json(200, { ok: true, persisted: true })
}
