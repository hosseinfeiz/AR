// Server-side helper around `web-push` for delivering Web Push notifications
// to a tenant's stored subscription(s).
//
// Tables: `push_subscriptions` (see migration 20260520010900_push_subscriptions.sql)
//   - id uuid
//   - tenant_id text  (matches our cookie-based session.tenantId fixture id)
//   - endpoint text   (FCM/Mozilla autopush URL — globally unique)
//   - p256dh text
//   - auth_token text
//
// VAPID identity comes from env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
// Generate with `npx web-push generate-vapid-keys`. VAPID_SUBJECT must be a
// `mailto:` URL or HTTPS URL.
//
// Delivery error handling: on a `410 Gone` / `404 Not Found` from the push
// service the subscription is dead — callers should remove it. We surface
// per-subscription results from `deliverToTenant` so the caller can prune.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PushSubscriptionRecord {
  id: string
  tenant_id: string
  endpoint: string
  p256dh: string
  auth_token: string
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export interface DeliveryResult {
  endpoint: string
  ok: boolean
  statusCode?: number
  /** true when the subscription should be removed (410/404). */
  gone?: boolean
  error?: string
}

interface WebPushLike {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<{ statusCode: number }>
}

// We import `web-push` lazily so test code can stub it via `setWebPushImpl`
// without paying the module-load cost during static checks. The real module
// is CommonJS — top-level `import` works but adds noise to bundlers.
let _impl: WebPushLike | null = null
let _vapidConfigured = false

export function setWebPushImpl(impl: WebPushLike | null): void {
  _impl = impl
  _vapidConfigured = false
}

async function getImpl(): Promise<WebPushLike> {
  if (_impl) return _impl
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('web-push')
  _impl = (mod.default ?? mod) as WebPushLike
  return _impl
}

function vapidEnv(): { subject: string; publicKey: string; privateKey: string } | null {
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return null
  return { subject, publicKey, privateKey }
}

async function ensureConfigured(impl: WebPushLike): Promise<boolean> {
  if (_vapidConfigured) return true
  const v = vapidEnv()
  if (!v) return false
  impl.setVapidDetails(v.subject, v.publicKey, v.privateKey)
  _vapidConfigured = true
  return true
}

/** True when VAPID env vars are present. */
export function isPushConfigured(): boolean {
  return vapidEnv() !== null
}

/** Send to one subscription. Used by `deliverToTenant`; exposed for tests. */
export async function sendOne(
  sub: PushSubscriptionRecord,
  payload: PushPayload,
): Promise<DeliveryResult> {
  const impl = await getImpl()
  const ok = await ensureConfigured(impl)
  if (!ok) {
    return { endpoint: sub.endpoint, ok: false, error: 'VAPID keys not configured' }
  }
  try {
    const res = await impl.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_token } },
      JSON.stringify(payload),
    )
    return { endpoint: sub.endpoint, ok: true, statusCode: res.statusCode }
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string }
    const statusCode = err.statusCode
    const gone = statusCode === 404 || statusCode === 410
    return {
      endpoint: sub.endpoint,
      ok: false,
      statusCode,
      gone,
      error: err.message ?? err.body ?? 'unknown push error',
    }
  }
}

/**
 * Deliver `payload` to every subscription stored for `tenantId`.
 * Dead subscriptions (404/410) are removed from the database before returning.
 */
export async function deliverToTenant(args: {
  admin: SupabaseClient
  tenantId: string
  payload: PushPayload
}): Promise<DeliveryResult[]> {
  const { admin, tenantId, payload } = args

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, tenant_id, endpoint, p256dh, auth_token')
    .eq('tenant_id', tenantId)

  if (error) {
    return [{ endpoint: '', ok: false, error: error.message }]
  }

  const rows = (subs ?? []) as PushSubscriptionRecord[]
  if (rows.length === 0) return []

  const results: DeliveryResult[] = []
  for (const sub of rows) {
    // Serial — keeps test ordering stable + push services rate-limit per-endpoint.
    results.push(await sendOne(sub, payload))
  }

  const deadIds = rows
    .filter((_, i) => results[i]?.gone)
    .map((s) => s.id)
  if (deadIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', deadIds)
  }
  return results
}
