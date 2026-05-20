import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/resend.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { renderManagerNotification } from './templates/manager-notification.tsx'
import { renderSubmitterConfirmation } from './templates/submitter-confirmation.tsx'

interface Webhook {
  type: 'INSERT'
  table: 'showing_requests' | 'maintenance_requests'
  record: Record<string, any>
  schema: 'public'
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const expected = Deno.env.get('NOTIFY_WEBHOOK_SECRET')
  if (!expected) {
    console.error('NOTIFY_WEBHOOK_SECRET unset; refusing to process webhook')
    return new Response('server misconfigured', { status: 500, headers: corsHeaders })
  }
  const provided = req.headers.get('x-webhook-secret') ?? ''
  if (!timingSafeEqual(provided, expected)) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders })
  }

  const payload = (await req.json()) as Webhook
  if (payload.type !== 'INSERT') return new Response('ignored', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const isMaint = payload.table === 'maintenance_requests'
  const r = payload.record

  const { data: building } = await supabase.from('buildings').select('name').eq('id', r.building_id).single()
  const { data: managers } = await supabase.from('managers_allowlist').select('email')
  const managerEmails = (managers ?? []).map((m) => m.email)
  if (managerEmails.length === 0) {
    console.warn('no managers in allowlist, skipping fan-out')
  }

  const studioUrl = `${Deno.env.get('SUPABASE_URL')!.replace('/v1', '')}/project/_/editor`
  const details: Record<string, string> = isMaint ? {
    'Unit': r.unit_number,
    'Tenant': r.tenant_name,
    'Email': r.tenant_email ?? '—',
    'Phone': r.tenant_phone ?? '—',
    'Issue': r.issue_type,
    'Urgency': r.urgency,
    'Description': r.description,
    'Photos': String((r.photo_paths as string[]).length),
  } : {
    'Prospect': r.prospect_name,
    'Email': r.prospect_email,
    'Phone': r.prospect_phone ?? '—',
    'Slot ID': r.slot_id ?? '—',
    'Preferred dates': r.preferred_dates ? JSON.stringify(r.preferred_dates) : '—',
    'Message': r.message ?? '—',
  }

  const mgr = renderManagerNotification({
    type: isMaint ? 'maintenance' : 'showing',
    ref_id: r.ref_id,
    building_name: building?.name ?? r.building_id,
    details,
    studio_url: studioUrl,
  })

  const recipientEmail = isMaint ? r.tenant_email : r.prospect_email
  const recipientName = isMaint ? r.tenant_name : r.prospect_name

  const tasks: Promise<unknown>[] = []
  if (managerEmails.length > 0) {
    tasks.push(sendEmail({ to: managerEmails, subject: mgr.subject, html: mgr.html, reply_to: recipientEmail ?? undefined }))
  }
  if (recipientEmail) {
    const sub = renderSubmitterConfirmation({
      type: isMaint ? 'maintenance' : 'showing',
      ref_id: r.ref_id,
      recipient_name: recipientName,
    })
    tasks.push(sendEmail({ to: [recipientEmail], subject: sub.subject, html: sub.html }))
  }

  if (isMaint && r.urgency === 'emergency' && Deno.env.get('EMERGENCY_WEBHOOK_URL')) {
    tasks.push(fetch(Deno.env.get('EMERGENCY_WEBHOOK_URL')!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: mgr.subject + '\n' + mgr.html.replace(/<[^>]+>/g, '').slice(0, 500) }),
    }))
  }

  const results = await Promise.allSettled(tasks)
  const failed = results.filter((x) => x.status === 'rejected')
  if (failed.length > 0) {
    console.error('notify failures', failed)
  }
  return Response.json({ sent: results.length, failed: failed.length }, { headers: corsHeaders })
})
