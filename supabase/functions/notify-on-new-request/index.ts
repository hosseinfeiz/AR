import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/resend.ts'
import { corsHeaders } from '../_shared/cors.ts'
import {
  renderManagerNotification,
  renderSubmitterConfirmation,
} from '../_shared/render-email.ts'

interface Webhook {
  type: 'INSERT'
  table: 'showing_requests' | 'maintenance_requests'
  record: Record<string, any>
  schema: 'public'
}

interface ManagerPref {
  manager_email: string
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  batch_after_count: number
  filters: Record<string, unknown>
}

// Wall-clock minutes in UTC. Edge functions run in UTC, which matches the time
// the manager_preferences `time` columns are interpreted in (no tz on `time`).
function nowMinutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

function parseHHMM(v: string | null): number | null {
  if (!v) return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v.trim())
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (Number.isNaN(h) || Number.isNaN(mm) || h > 23 || mm > 59) return null
  return h * 60 + mm
}

function isInQuietHours(d: Date, start: string | null, end: string | null): boolean {
  const s = parseHHMM(start)
  const e = parseHHMM(end)
  if (s === null || e === null) return false
  if (s === e) return false
  const t = nowMinutes(d)
  if (s < e) return t >= s && t < e
  return t >= s || t < e
}

interface DecisionInput {
  prefs: ManagerPref | null
  urgency: string | null
  kind: 'maintenance_request' | 'showing_request'
  issue?: string | null
  now: Date
}

function shouldDeliverNow(input: DecisionInput): { deliverNow: boolean; reason: string } {
  if (!input.prefs) return { deliverNow: true, reason: 'no-prefs' }
  if (input.urgency === 'emergency') return { deliverNow: true, reason: 'emergency-override' }
  if (isInQuietHours(input.now, input.prefs.quiet_hours_start, input.prefs.quiet_hours_end)) {
    return { deliverNow: false, reason: 'quiet-hours' }
  }
  const f = input.prefs.filters ?? {}
  const urgencies = (f as { urgencies?: string[] }).urgencies
  if (Array.isArray(urgencies) && urgencies.length > 0 && input.urgency) {
    if (!urgencies.includes(input.urgency)) return { deliverNow: false, reason: 'filtered-urgency' }
  }
  const kinds = (f as { kinds?: string[] }).kinds
  if (Array.isArray(kinds) && kinds.length > 0) {
    if (!kinds.includes(input.kind)) return { deliverNow: false, reason: 'filtered-kind' }
  }
  const issues = (f as { issues?: string[] }).issues
  if (Array.isArray(issues) && issues.length > 0 && input.issue) {
    if (!issues.includes(input.issue.toLowerCase())) {
      return { deliverNow: false, reason: 'filtered-issue' }
    }
  }
  if ((input.prefs.batch_after_count ?? 1) > 1) {
    return { deliverNow: false, reason: 'batch-window' }
  }
  return { deliverNow: true, reason: 'send-now' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  const payload = (await req.json()) as Webhook
  if (payload.type !== 'INSERT') return new Response('ignored', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const isMaint = payload.table === 'maintenance_requests'
  const kind: 'maintenance_request' | 'showing_request' = isMaint
    ? 'maintenance_request'
    : 'showing_request'
  const r = payload.record
  const urgency: string | null = isMaint ? (r.urgency as string) : 'normal'
  const isEmergency = isMaint && urgency === 'emergency'

  const { data: building } = await supabase
    .from('buildings')
    .select('name')
    .eq('id', r.building_id)
    .single()
  const { data: managers } = await supabase.from('managers_allowlist').select('email')
  const managerEmails: string[] = (managers ?? []).map((m: { email: string }) => m.email)
  if (managerEmails.length === 0) {
    console.warn('no managers in allowlist, skipping fan-out')
  }

  // Load preferences for all managers in a single round-trip.
  const { data: prefsRows } = await supabase
    .from('manager_preferences')
    .select('*')
    .in('manager_email', managerEmails.length > 0 ? managerEmails : [''])
  const prefsByEmail = new Map<string, ManagerPref>()
  for (const p of (prefsRows ?? []) as ManagerPref[]) prefsByEmail.set(p.manager_email, p)

  const studioUrl = `${Deno.env.get('SUPABASE_URL')!.replace('/v1', '')}/project/_/editor`
  const details: Record<string, string> = isMaint
    ? {
        Unit: String(r.unit_number),
        Tenant: String(r.tenant_name),
        Email: r.tenant_email ?? '—',
        Phone: r.tenant_phone ?? '—',
        Issue: String(r.issue_type),
        Urgency: String(r.urgency),
        Description: String(r.description),
        Photos: String((r.photo_paths as string[]).length),
      }
    : {
        Prospect: String(r.prospect_name),
        Email: String(r.prospect_email),
        Phone: r.prospect_phone ?? '—',
        'Slot ID': r.slot_id ?? '—',
        'Preferred dates': r.preferred_dates ? JSON.stringify(r.preferred_dates) : '—',
        Message: r.message ?? '—',
      }

  const mgrRendered = renderManagerNotification({
    type: isMaint ? 'maintenance' : 'showing',
    ref_id: r.ref_id,
    building_name: building?.name ?? r.building_id,
    details,
    studio_url: studioUrl,
    is_emergency: isEmergency,
  })

  const submitterEmail = isMaint ? r.tenant_email : r.prospect_email
  const submitterName = isMaint ? r.tenant_name : r.prospect_name

  const now = new Date()
  const tasks: Promise<unknown>[] = []
  let immediateRecipients = 0
  let queuedRecipients = 0

  // Per-manager decision: enqueue in notifications + optionally send now.
  for (const email of managerEmails) {
    const prefs = prefsByEmail.get(email) ?? null
    const decision = shouldDeliverNow({
      prefs,
      urgency,
      kind,
      issue: isMaint ? String(r.issue_type) : null,
      now,
    })

    // Always enqueue an in-app notification row.
    const notifPayload = {
      ref_id: r.ref_id,
      building_id: r.building_id,
      building_name: building?.name ?? null,
      urgency,
      details,
      title: isMaint ? 'New maintenance request' : 'New showing request',
      summary: isMaint
        ? `${r.unit_number} · ${r.issue_type} · ${r.urgency}`
        : `${r.prospect_name} · ${r.prospect_email}`,
      studio_url: studioUrl,
    }

    const insertTask = supabase
      .from('notifications')
      .insert({
        recipient_email: email,
        kind,
        payload: notifPayload,
        sent_at: decision.deliverNow ? new Date().toISOString() : null,
      })
      .then((res: { error: { message: string } | null }) => {
        if (res.error) console.error('notifications insert failed', res.error.message)
      })
    tasks.push(insertTask)

    if (decision.deliverNow) {
      immediateRecipients += 1
      tasks.push(
        sendEmail({
          to: [email],
          subject: mgrRendered.subject,
          html: mgrRendered.html,
          reply_to: submitterEmail ?? undefined,
        }),
      )
    } else {
      queuedRecipients += 1
      console.log(`queued for ${email} (reason: ${decision.reason})`)
    }
  }

  if (submitterEmail) {
    const sub = renderSubmitterConfirmation({
      type: isMaint ? 'maintenance' : 'showing',
      ref_id: r.ref_id,
      recipient_name: submitterName,
    })
    tasks.push(sendEmail({ to: [submitterEmail], subject: sub.subject, html: sub.html }))
  }

  if (isEmergency && Deno.env.get('EMERGENCY_WEBHOOK_URL')) {
    tasks.push(
      fetch(Deno.env.get('EMERGENCY_WEBHOOK_URL')!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: mgrRendered.subject + '\n' + mgrRendered.html.replace(/<[^>]+>/g, '').slice(0, 500),
        }),
      }),
    )
  }

  const results = await Promise.allSettled(tasks)
  const failed = results.filter((x) => x.status === 'rejected')
  if (failed.length > 0) {
    console.error('notify failures', failed)
  }
  return Response.json(
    {
      sent: immediateRecipients,
      queued: queuedRecipients,
      tasks: results.length,
      failed: failed.length,
    },
    { headers: corsHeaders },
  )
})
