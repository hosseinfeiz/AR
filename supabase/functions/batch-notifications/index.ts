// Cron-style function that picks up un-sent `notifications` rows older than
// X minutes, groups them by recipient, sends a digest, and marks `sent_at`.
//
// Invocation:
//   - Scheduled: pg_cron entry running every 5 minutes (see runbook).
//   - Manual:    `supabase functions invoke batch-notifications --no-verify-jwt`
//
// Query params:
//   - older_than_minutes (default 10): only pick rows with created_at <= now - N minutes.
//   - dry_run=1: skip sendEmail; report what would have been sent.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendEmail } from '../_shared/resend.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { renderBatchedDigest, type DigestItem } from '../_shared/render-email.ts'

interface NotifRow {
  id: string
  recipient_email: string
  kind: 'maintenance_request' | 'showing_request' | 'digest' | 'system'
  payload: Record<string, unknown>
  sent_at: string | null
  read_at: string | null
  created_at: string
}

function toDigestItem(r: NotifRow): DigestItem {
  const p = r.payload ?? {}
  return {
    kind: r.kind === 'digest' ? 'system' : r.kind,
    ref_id: typeof p.ref_id === 'string' ? p.ref_id : undefined,
    title: typeof p.title === 'string' ? p.title : labelFor(r.kind),
    summary: typeof p.summary === 'string' ? p.summary : '',
    created_at: r.created_at,
    studio_url: typeof p.studio_url === 'string' ? p.studio_url : undefined,
  }
}

function labelFor(kind: NotifRow['kind']): string {
  switch (kind) {
    case 'maintenance_request': return 'New maintenance request'
    case 'showing_request': return 'New showing request'
    case 'digest': return 'Digest'
    case 'system': return 'System'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const url = new URL(req.url)
  const olderThanMinutes = Math.max(0, Number(url.searchParams.get('older_than_minutes') ?? '10') || 10)
  const dryRun = url.searchParams.get('dry_run') === '1'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString()

  const { data: rows, error } = await supabase
    .from('notifications')
    .select('*')
    .is('sent_at', null)
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(1000)
  if (error) {
    console.error('batch-notifications: query failed', error.message)
    return Response.json({ ok: false, error: error.message }, { status: 500, headers: corsHeaders })
  }

  const queued = (rows ?? []) as NotifRow[]
  if (queued.length === 0) {
    return Response.json({ ok: true, recipients: 0, items: 0 }, { headers: corsHeaders })
  }

  // Group by recipient.
  const groups = new Map<string, NotifRow[]>()
  for (const r of queued) {
    const list = groups.get(r.recipient_email) ?? []
    list.push(r)
    groups.set(r.recipient_email, list)
  }

  // Pull each recipient's batch_after_count threshold. If a recipient has not
  // accumulated enough items yet, skip them this cycle.
  const recipients = Array.from(groups.keys())
  const { data: prefsRows } = await supabase
    .from('manager_preferences')
    .select('manager_email, batch_after_count')
    .in('manager_email', recipients)
  const thresholdByEmail = new Map<string, number>()
  for (const p of (prefsRows ?? []) as { manager_email: string; batch_after_count: number }[]) {
    thresholdByEmail.set(p.manager_email, p.batch_after_count ?? 1)
  }

  let sentRecipients = 0
  let sentItems = 0
  const skipped: { email: string; reason: string }[] = []

  for (const [email, items] of groups) {
    const threshold = thresholdByEmail.get(email) ?? 1
    if (items.length < threshold) {
      skipped.push({ email, reason: `below threshold (${items.length}/${threshold})` })
      continue
    }
    const digest = renderBatchedDigest({
      recipient_email: email,
      items: items.map(toDigestItem),
      generated_at: new Date().toISOString(),
    })

    if (!dryRun) {
      try {
        await sendEmail({ to: [email], subject: digest.subject, html: digest.html })
      } catch (e) {
        console.error('batch-notifications: sendEmail failed', email, (e as Error).message)
        continue
      }
      const ids = items.map((x) => x.id)
      const nowIso = new Date().toISOString()
      const { error: updErr } = await supabase
        .from('notifications')
        .update({ sent_at: nowIso })
        .in('id', ids)
      if (updErr) {
        console.error('batch-notifications: update failed', updErr.message)
        continue
      }
    }
    sentRecipients += 1
    sentItems += items.length
  }

  return Response.json(
    {
      ok: true,
      recipients: sentRecipients,
      items: sentItems,
      skipped,
      dry_run: dryRun,
      cutoff,
    },
    { headers: corsHeaders },
  )
})
