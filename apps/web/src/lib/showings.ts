// Server-side data + token helpers for showings.
//
// Tokens are an HMAC-signed payload — the showing's ref_id + an issued-at timestamp.
// We store a SHA-256 hash of the token in `showing_requests.reschedule_token_hash`
// so the link can be revoked (regenerated → hash changes → old links 404).

import { getAdminClient } from './supabase-admin'

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14 // 14 days

interface TokenPayload {
  ref: string
  iat: number
}

function getSecret(env?: Record<string, string | undefined>): string {
  const src = env ?? (process.env as Record<string, string | undefined>)
  const s = src.RESCHEDULE_SECRET
  if (!s || s.length < 16) {
    throw new Error('RESCHEDULE_SECRET env is not set or too short (need >=16 chars)')
  }
  return s
}

// Base64url helpers (no padding) — Workers/Node compatible.
function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const raw = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin).toString('base64')
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4)
  const padded = (s + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/')
  if (typeof atob === 'function') {
    const bin = atob(padded)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  return Uint8Array.from(Buffer.from(padded, 'base64'))
}

async function hmacSign(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return new Uint8Array(sig)
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  const arr = Array.from(new Uint8Array(buf))
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function issueRescheduleToken(refId: string, env?: Record<string, string | undefined>): Promise<{
  token: string
  hash: string
}> {
  const secret = getSecret(env)
  const payload: TokenPayload = { ref: refId, iat: Math.floor(Date.now() / 1000) }
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const sig = await hmacSign(body, secret)
  const token = `${body}.${b64urlEncode(sig)}`
  const hash = await sha256Hex(token)
  return { token, hash }
}

export interface VerifiedToken {
  ok: true
  refId: string
  issuedAt: number
}

export interface VerifyFailure {
  ok: false
  reason: 'malformed' | 'bad_signature' | 'expired'
}

export async function verifyRescheduleToken(token: string, env?: Record<string, string | undefined>): Promise<VerifiedToken | VerifyFailure> {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [body, sig] = parts as [string, string]
  let secret: string
  try { secret = getSecret(env) } catch { return { ok: false, reason: 'bad_signature' } }

  const expectedSig = await hmacSign(body, secret)
  const givenSig = b64urlDecode(sig)
  if (!timingSafeEqual(expectedSig, givenSig)) return { ok: false, reason: 'bad_signature' }

  let payload: TokenPayload
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as TokenPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof payload.ref !== 'string' || typeof payload.iat !== 'number') {
    return { ok: false, reason: 'malformed' }
  }
  const now = Math.floor(Date.now() / 1000)
  if (now - payload.iat > TOKEN_TTL_SECONDS) return { ok: false, reason: 'expired' }
  return { ok: true, refId: payload.ref, issuedAt: payload.iat }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export async function tokenHashFor(token: string): Promise<string> {
  return sha256Hex(token)
}

// --- DB helpers -----------------------------------------------------------

export interface ShowingRow {
  id: string
  ref_id: string
  building_id: string
  unit_id: string | null
  slot_id: string | null
  prospect_name: string
  prospect_email: string
  prospect_phone: string | null
  scheduled_at: string | null
  status: string
  reschedule_token_hash: string | null
  no_show_at: string | null
}

export async function getShowingByRefId(refId: string): Promise<ShowingRow | null> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('showing_requests')
    .select('id, ref_id, building_id, unit_id, slot_id, prospect_name, prospect_email, prospect_phone, scheduled_at, status, reschedule_token_hash, no_show_at')
    .eq('ref_id', refId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as ShowingRow | null) ?? null
}

export async function setShowingScheduledAt(
  refId: string,
  scheduledAt: Date,
  tokenHash: string,
): Promise<void> {
  const admin = getAdminClient()
  const { error } = await admin
    .from('showing_requests')
    .update({
      scheduled_at: scheduledAt.toISOString(),
      status: 'scheduled',
      reschedule_token_hash: tokenHash,
    })
    .eq('ref_id', refId)
  if (error) throw new Error(error.message)
}

export async function flagNoShow(refId: string): Promise<void> {
  const admin = getAdminClient()
  const { error } = await admin
    .from('showing_requests')
    .update({ no_show_at: new Date().toISOString(), status: 'no_show' })
    .eq('ref_id', refId)
  if (error) throw new Error(error.message)
}
