// GET /api/oauth/google-calendar/callback?code=...&state=...
//
// Receives Google's auth code, exchanges it for tokens, decodes the id_token to
// find the manager's email, then upserts the refresh token into
// `manager_calendar_connections`. Redirects back to /admin/showings/calendar.

import type { APIRoute } from 'astro'
import { getSession } from '../../../../lib/auth'
import { exchangeCode, isGoogleConfigured } from '../../../../lib/google-calendar'
import { verifyRescheduleToken, type VerifiedToken, type VerifyFailure } from '../../../../lib/showings'
import { getAdminClient } from '../../../../lib/supabase-admin'

export const prerender = false

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const padded = (parts[1] ?? '') + '='.repeat((4 - ((parts[1] ?? '').length % 4)) % 4)
    const normalized = padded.replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof atob === 'function'
      ? atob(normalized)
      : Buffer.from(normalized, 'base64').toString('utf-8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export const GET: APIRoute = async ({ url, cookies, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response('Login required', { status: 401 })
  }
  const env = envFor(locals)
  if (!isGoogleConfigured(env)) {
    return new Response('Google OAuth not configured', { status: 503 })
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error')
  if (err) {
    return new Response(`Google returned error: ${err}`, { status: 400 })
  }
  if (!code || !state) {
    return new Response('Missing code/state', { status: 400 })
  }

  const v: VerifiedToken | VerifyFailure = await verifyRescheduleToken(state, env)
    .catch((): VerifyFailure => ({ ok: false, reason: 'bad_signature' }))
  if (!v.ok) return new Response('State invalid or expired', { status: 401 })

  let tokens
  try {
    tokens = await exchangeCode(code, env)
  } catch (e) {
    return new Response(`Token exchange failed: ${(e as Error).message}`, { status: 502 })
  }

  if (!tokens.refresh_token) {
    return new Response('No refresh_token returned by Google. Try revoking access in your Google account and connecting again.', {
      status: 400,
    })
  }

  const idClaims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : null
  const email = (idClaims?.email as string | undefined) ?? null
  if (!email) {
    return new Response('Could not extract email from id_token', { status: 400 })
  }

  // We bind the connection to the granting Google account's email.
  // manager_id is best-effort: only meaningful if Supabase auth is wired up.
  let managerUserId: string | null = null
  try {
    const admin = getAdminClient()
    const { data: u } = await admin
      .from('managers_allowlist')
      .select('email')
      .eq('email', email)
      .maybeSingle()
    if (!u) {
      return new Response(`Email ${email} is not on the manager allowlist.`, { status: 403 })
    }
    // Without a Supabase Auth user row we'd need a synthetic id. To keep manager_id
    // primary-key-able, generate a deterministic UUID from the email when needed.
    const synthetic = await syntheticUserId(email)
    managerUserId = synthetic

    const { error: upsertErr } = await admin
      .from('manager_calendar_connections')
      .upsert(
        {
          manager_id: managerUserId,
          manager_email: email,
          google_refresh_token: tokens.refresh_token,
          calendar_id: 'primary',
        },
        { onConflict: 'manager_id' },
      )
    if (upsertErr) throw upsertErr
  } catch (e) {
    return new Response(`Failed to store connection: ${(e as Error).message}`, { status: 500 })
  }

  return Response.redirect(new URL('/admin/showings/calendar?connected=1', url).toString(), 302)
}

// Deterministic v5-style UUID from an email — keeps manager_id stable across reconnects
// even without a real Supabase Auth user.
async function syntheticUserId(email: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`manager:${email}`))
  const bytes = new Uint8Array(buf).slice(0, 16)
  // Force the version (4) and variant bits.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
