export const prerender = false
import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { messages } from '../../../lib/tenant-fixtures'

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'tenant') {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  let body: { messageId?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const { messageId } = body
  if (!messageId) {
    return new Response(JSON.stringify({ ok: false, error: 'messageId required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const message = messages.find((m) => m.id === messageId)
  if (!message || message.tenant_id !== session.tenantId) {
    return new Response(JSON.stringify({ ok: false, error: 'Message not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    })
  }

  message.read = true

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
