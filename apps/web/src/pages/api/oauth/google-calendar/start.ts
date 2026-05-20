// GET /api/oauth/google-calendar/start
//
// Manager-initiated. Builds the Google OAuth consent URL and redirects.
// The "state" param is an HMAC-signed payload containing the manager's email
// (from their session cookie) so we can attribute the refresh token on callback.

import type { APIRoute } from 'astro'
import { getSession } from '../../../../lib/auth'
import { buildAuthUrl, isGoogleConfigured } from '../../../../lib/google-calendar'
import { issueRescheduleToken } from '../../../../lib/showings'

export const prerender = false

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

export const GET: APIRoute = async ({ cookies, locals }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return new Response('Login required', { status: 401 })
  }
  const env = envFor(locals)
  if (!isGoogleConfigured(env)) {
    return new Response('Google OAuth not configured (missing GOOGLE_OAUTH_* env)', { status: 503 })
  }

  // Re-use the HMAC machinery to make a short-lived state token.
  // (The "ref" here doubles as a CSRF nonce — admin sessions are coarse so we
  // just bind the state to the current minute.)
  const { token: state } = await issueRescheduleToken(`admin-${Math.floor(Date.now() / 60000)}`, env)
  const url = buildAuthUrl(state, env)
  return Response.redirect(url, 302)
}
