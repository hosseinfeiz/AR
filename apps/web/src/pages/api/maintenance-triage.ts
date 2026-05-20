// POST /api/maintenance-triage
//
// Called from the maintenance form on description blur (BEFORE the user
// submits the form). Classifies the free-text description into an
// issue_type + urgency suggestion and surfaces a non-blocking warning if
// the user's chosen urgency conflicts with the AI's suggestion.
//
// Public — no admin gate. Designed to be cheap and idempotent.

export const prerender = false
import type { APIRoute } from 'astro'
import { aiCtx, triageMaintenance } from '../../lib/ai-helpers'
import type { IssueType, Urgency } from '../../lib/ai-helpers'

interface Body {
  description?: unknown
  issue_type?: unknown
  urgency?: unknown
}

const ISSUE_TYPES: IssueType[] = ['plumbing', 'electrical', 'hvac', 'appliance', 'pest', 'locks', 'other']
const URGENCIES: Urgency[] = ['low', 'normal', 'high', 'emergency']

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const description = typeof body.description === 'string' ? body.description : ''
  if (description.trim().length < 10) {
    // Not enough signal to triage — return an explicit "skip" rather than an error.
    return new Response(
      JSON.stringify({ ok: true, result: null, reason: 'description-too-short' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  const issueType =
    typeof body.issue_type === 'string' && ISSUE_TYPES.includes(body.issue_type as IssueType)
      ? (body.issue_type as IssueType)
      : null
  const urgency =
    typeof body.urgency === 'string' && URGENCIES.includes(body.urgency as Urgency)
      ? (body.urgency as Urgency)
      : null

  const ctx = aiCtx({ locals })
  const result = await triageMaintenance(ctx, {
    description,
    issue_type: issueType,
    urgency,
  })

  return new Response(
    JSON.stringify({ ok: true, result, ai_enabled: Boolean(ctx.apiKey) }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}
