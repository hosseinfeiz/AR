// Server-side helpers for the S5 notification system.
//
// Three responsibilities:
//   1. Decide whether a notification should be delivered immediately or
//      held back for a later batched digest (`shouldDeliverNow`).
//   2. Record Resend webhook events into `email_events`
//      (`recordEmailEvent`).
//   3. Read/write the in-app notification center (`inAppCreate`,
//      `inAppMarkRead`, `inAppListForRecipient`).
//
// All DB writes go through the service-role admin client so they bypass RLS.
// The /admin/notifications/inbox page reads via the anon client + RLS instead,
// which is enforced by the policies in 20260520010500_notifications.sql.

import { getAdminClient } from './supabase-admin'

export type NotificationKind =
  | 'maintenance_request'
  | 'showing_request'
  | 'digest'
  | 'system'

export interface ManagerPreferences {
  manager_email: string
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  batch_after_count: number
  filters: Record<string, unknown>
  updated_at?: string
}

export interface NotificationRow {
  id: string
  recipient_email: string
  kind: NotificationKind
  payload: Record<string, unknown>
  sent_at: string | null
  read_at: string | null
  created_at: string
}

export interface EmailEventInput {
  provider_message_id?: string | null
  kind: 'delivered' | 'bounced' | 'complaint' | 'opened' | 'clicked' | 'sent' | 'delivery_delayed' | 'failed'
  raw: Record<string, unknown>
}

export interface DeliveryDecisionInput {
  prefs: ManagerPreferences | null
  urgency?: 'emergency' | 'high' | 'normal' | 'low' | null
  kind?: NotificationKind
  /** Defaults to current wall-clock time. */
  now?: Date
}

export interface DeliveryDecision {
  deliverNow: boolean
  reason:
    | 'no-prefs'
    | 'emergency-override'
    | 'quiet-hours'
    | 'batch-window'
    | 'filtered-out'
    | 'send-now'
}

const DEFAULT_PREFS: ManagerPreferences = {
  manager_email: '',
  quiet_hours_start: null,
  quiet_hours_end: null,
  batch_after_count: 1,
  filters: {},
}

/**
 * Decide whether the notification should fire immediately as an email or be
 * deferred into a batched digest.
 *
 * Rules (in order):
 *   1. If no prefs exist for the recipient → deliver now.
 *   2. Emergency urgency always delivers now (override).
 *   3. If the current time falls inside the manager's quiet hours window →
 *      defer (batch).
 *   4. If kind/urgency filters reject this notification → defer.
 *   5. If `batch_after_count > 1` → defer.
 *   6. Otherwise → deliver now.
 */
export function shouldDeliverNow(input: DeliveryDecisionInput): DeliveryDecision {
  const { prefs, urgency, kind, now } = input
  if (!prefs) return { deliverNow: true, reason: 'no-prefs' }
  if (urgency === 'emergency') return { deliverNow: true, reason: 'emergency-override' }

  const t = now ?? new Date()

  if (isInQuietHours(t, prefs.quiet_hours_start, prefs.quiet_hours_end)) {
    return { deliverNow: false, reason: 'quiet-hours' }
  }

  if (!passesFilters(prefs.filters, { urgency, kind })) {
    return { deliverNow: false, reason: 'filtered-out' }
  }

  if (prefs.batch_after_count > 1) {
    return { deliverNow: false, reason: 'batch-window' }
  }

  return { deliverNow: true, reason: 'send-now' }
}

export function isInQuietHours(
  now: Date,
  start: string | null,
  end: string | null,
): boolean {
  if (!start || !end) return false
  // Compare against UTC wall-clock — `time` columns in Postgres have no tz,
  // and the batch function (Deno edge runtime) also runs in UTC. Keeping both
  // sides UTC means quiet hours line up regardless of the manager's locale.
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const s = parseHHMM(start)
  const e = parseHHMM(end)
  if (s === null || e === null) return false
  if (s === e) return false
  if (s < e) {
    // Same-day window (e.g. 13:00–17:00).
    return minutes >= s && minutes < e
  }
  // Wraps midnight (e.g. 22:00–07:00).
  return minutes >= s || minutes < e
}

function parseHHMM(v: string): number | null {
  // Accept "HH:MM" or "HH:MM:SS".
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v.trim())
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (Number.isNaN(h) || Number.isNaN(mm) || h > 23 || mm > 59) return null
  return h * 60 + mm
}

interface FilterInput {
  urgency?: 'emergency' | 'high' | 'normal' | 'low' | null
  kind?: NotificationKind
}

export function passesFilters(filters: Record<string, unknown>, input: FilterInput): boolean {
  if (!filters || typeof filters !== 'object') return true

  const allowedUrgencies = filters.urgencies
  if (Array.isArray(allowedUrgencies) && allowedUrgencies.length > 0 && input.urgency) {
    if (!allowedUrgencies.includes(input.urgency)) return false
  }

  const allowedIssues = filters.issues
  // `issues` is reserved for maintenance issue_type filtering — applied by the
  // edge function where the issue value is available. We pass through here.
  void allowedIssues

  const allowedKinds = filters.kinds
  if (Array.isArray(allowedKinds) && allowedKinds.length > 0 && input.kind) {
    if (!allowedKinds.includes(input.kind)) return false
  }

  return true
}

// ---------------------------------------------------------------------------
// In-app notification center (service role)
// ---------------------------------------------------------------------------

export async function inAppCreate(args: {
  recipient_email: string
  kind: NotificationKind
  payload: Record<string, unknown>
  sent_at?: string | null
}): Promise<{ id: string } | { error: string }> {
  const sb = getAdminClient()
  const { data, error } = await sb
    .from('notifications')
    .insert({
      recipient_email: args.recipient_email,
      kind: args.kind,
      payload: args.payload,
      sent_at: args.sent_at ?? null,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  return { id: data!.id as string }
}

export async function inAppMarkRead(args: {
  id: string
  recipient_email: string
}): Promise<{ ok: true } | { error: string }> {
  const sb = getAdminClient()
  const { error } = await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', args.id)
    .eq('recipient_email', args.recipient_email)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function inAppListForRecipient(args: {
  recipient_email: string
  limit?: number
  unread_only?: boolean
}): Promise<NotificationRow[]> {
  const sb = getAdminClient()
  let q = sb
    .from('notifications')
    .select('*')
    .eq('recipient_email', args.recipient_email)
    .order('created_at', { ascending: false })
    .limit(args.limit ?? 100)
  if (args.unread_only) q = q.is('read_at', null)
  const { data, error } = await q
  if (error) return []
  return (data ?? []) as NotificationRow[]
}

// ---------------------------------------------------------------------------
// Manager preferences (service role read; UI uses anon+RLS for self-edit)
// ---------------------------------------------------------------------------

export async function getManagerPreferences(email: string): Promise<ManagerPreferences | null> {
  const sb = getAdminClient()
  const { data, error } = await sb
    .from('manager_preferences')
    .select('*')
    .eq('manager_email', email)
    .maybeSingle()
  if (error || !data) return null
  return data as ManagerPreferences
}

export async function upsertManagerPreferences(prefs: ManagerPreferences): Promise<{ ok: true } | { error: string }> {
  const sb = getAdminClient()
  const row = {
    manager_email: prefs.manager_email,
    quiet_hours_start: prefs.quiet_hours_start,
    quiet_hours_end: prefs.quiet_hours_end,
    batch_after_count: prefs.batch_after_count,
    filters: prefs.filters,
  }
  const { error } = await sb.from('manager_preferences').upsert(row, { onConflict: 'manager_email' })
  if (error) return { error: error.message }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Email event ingestion
// ---------------------------------------------------------------------------

export async function recordEmailEvent(event: EmailEventInput): Promise<{ ok: true } | { error: string }> {
  const sb = getAdminClient()
  const { error } = await sb
    .from('email_events')
    .insert({
      provider_message_id: event.provider_message_id ?? null,
      kind: event.kind,
      raw: event.raw,
    })
  if (error) return { error: error.message }
  return { ok: true }
}

export { DEFAULT_PREFS }
