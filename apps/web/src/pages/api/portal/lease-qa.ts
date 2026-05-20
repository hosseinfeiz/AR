export const prerender = false

import type { APIRoute } from 'astro'
import { getSession } from '../../../lib/auth'
import { leaseForTenant } from '../../../lib/tenant-fixtures'
import { retrieve, streamAnswer, toCitations } from '../../../lib/rag'

/**
 * POST /api/portal/lease-qa
 * Body: { question: string }
 *
 * Streaming response:
 *   - First line:  `data: {"type":"citations","citations":[...]}`
 *   - Then deltas: `data: {"type":"delta","text":"..."}`
 *   - Final:       `data: {"type":"done"}`
 *
 * SSE-style framing on a plain `Response` stream so the React island can
 * render token-by-token without a heavy SSE dependency.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'tenant') {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  let body: { question?: string }
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }
  const question = body.question?.trim()
  if (!question) return json({ ok: false, error: 'question required' }, 400)
  if (question.length > 1000) return json({ ok: false, error: 'question too long' }, 400)

  // Resolve the tenant's active lease. The fixture data is the source of
  // truth in this codebase today; if Supabase Auth gets wired for tenants
  // (see runbook), swap this for a query against `leases`.
  const lease = leaseForTenant(session.tenantId)
  if (!lease) return json({ ok: false, error: 'No active lease on file' }, 404)

  let contexts
  try {
    contexts = await retrieve(question, lease.id, 6)
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    return json({ ok: false, error: `retrieval failed: ${msg}` }, 500)
  }

  if (contexts.length === 0) {
    // No ingested lease text yet — return a graceful answer rather than a
    // 500 so the UI can render a useful message.
    return json({
      ok: true,
      streamed: false,
      answer:
        "I don't have your lease document on file yet, so I can't answer questions about it. Please contact the management office.",
      citations: [],
    })
  }

  const stream = streamAnswer(question, contexts)
  const encoder = new TextEncoder()

  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }

      try {
        send({ type: 'citations', citations: toCitations(contexts) })

        // The TypeScript SDK emits a 'text' event per delta.
        stream.on('text', (delta: string) => {
          if (delta) send({ type: 'delta', text: delta })
        })

        await stream.finalMessage()
        send({ type: 'done' })
      } catch (e) {
        send({ type: 'error', error: (e as Error).message ?? String(e) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(body$, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
