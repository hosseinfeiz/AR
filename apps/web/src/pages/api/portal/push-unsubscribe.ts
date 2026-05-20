// POST /api/portal/push-unsubscribe
//
// Removes a tenant's Web Push subscription. Auth: tenant cookie session.
// Body: { endpoint }

export const prerender = false

import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { getAdminClient } from '../../../lib/supabase-admin'

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

  let body: { endpoint?: string }
  try {
    body = (await request.json()) as { endpoint?: string }
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON' })
  }

  const endpoint = body.endpoint
  if (!endpoint) {
    return json(400, { ok: false, error: 'endpoint required' })
  }

  let admin
  try {
    admin = getAdminClient()
  } catch {
    return json(200, { ok: true, persisted: false })
  }

  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('tenant_id', session.tenantId)
    .eq('endpoint', endpoint)

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[push-unsubscribe] delete failed', error)
    return json(500, { ok: false, error: 'Failed to remove subscription' })
  }

  return json(200, { ok: true, persisted: true })
}
