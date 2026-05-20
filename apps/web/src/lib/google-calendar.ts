// Google Calendar OAuth + free/busy helper.
//
// One OAuth app (operator-owned); each manager connects their own Google account
// and we store the refresh token in `manager_calendar_connections`. We swap the
// refresh token for a short-lived access token on demand.
//
// Scopes requested: calendar.readonly + calendar.events (insert events for confirmed
// showings, read busy windows for the availability picker).

export interface GoogleOAuthEnv {
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  GOOGLE_OAUTH_REDIRECT_URI?: string
}

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
]

export interface BusyWindow {
  start: string // ISO
  end: string   // ISO
}

export function getOAuthEnv(env?: Record<string, string | undefined>): GoogleOAuthEnv {
  const src = env ?? (process.env as Record<string, string | undefined>)
  return {
    GOOGLE_OAUTH_CLIENT_ID: src.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: src.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: src.GOOGLE_OAUTH_REDIRECT_URI,
  }
}

export function isGoogleConfigured(env?: Record<string, string | undefined>): boolean {
  const o = getOAuthEnv(env)
  return Boolean(o.GOOGLE_OAUTH_CLIENT_ID && o.GOOGLE_OAUTH_CLIENT_SECRET && o.GOOGLE_OAUTH_REDIRECT_URI)
}

export function buildAuthUrl(state: string, env?: Record<string, string | undefined>): string {
  const o = getOAuthEnv(env)
  if (!o.GOOGLE_OAUTH_CLIENT_ID || !o.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error('Google OAuth env not configured')
  }
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', o.GOOGLE_OAUTH_CLIENT_ID)
  u.searchParams.set('redirect_uri', o.GOOGLE_OAUTH_REDIRECT_URI)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('state', state)
  return u.toString()
}

export interface TokenExchange {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
  token_type: string
  scope: string
}

export async function exchangeCode(code: string, env?: Record<string, string | undefined>): Promise<TokenExchange> {
  const o = getOAuthEnv(env)
  if (!o.GOOGLE_OAUTH_CLIENT_ID || !o.GOOGLE_OAUTH_CLIENT_SECRET || !o.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error('Google OAuth env not configured')
  }
  const body = new URLSearchParams()
  body.set('code', code)
  body.set('client_id', o.GOOGLE_OAUTH_CLIENT_ID)
  body.set('client_secret', o.GOOGLE_OAUTH_CLIENT_SECRET)
  body.set('redirect_uri', o.GOOGLE_OAUTH_REDIRECT_URI)
  body.set('grant_type', 'authorization_code')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as TokenExchange
}

export async function refreshAccessToken(
  refreshToken: string,
  env?: Record<string, string | undefined>,
): Promise<{ access_token: string; expires_in: number }> {
  const o = getOAuthEnv(env)
  if (!o.GOOGLE_OAUTH_CLIENT_ID || !o.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error('Google OAuth env not configured')
  }
  const body = new URLSearchParams()
  body.set('refresh_token', refreshToken)
  body.set('client_id', o.GOOGLE_OAUTH_CLIENT_ID)
  body.set('client_secret', o.GOOGLE_OAUTH_CLIENT_SECRET)
  body.set('grant_type', 'refresh_token')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    throw new Error(`Google refresh failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as { access_token: string; expires_in: number }
}

/** Calls Google freeBusy.query for the given calendar id between `from` and `to`. */
export async function freeBusy(args: {
  accessToken: string
  calendarId: string
  from: string
  to: string
}): Promise<BusyWindow[]> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: args.from,
      timeMax: args.to,
      items: [{ id: args.calendarId }],
    }),
  })
  if (!res.ok) throw new Error(`Google freeBusy failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: BusyWindow[] }>
  }
  const cal = data.calendars?.[args.calendarId]
  return cal?.busy ?? []
}

export interface CreatedEvent {
  id: string
  htmlLink?: string
}

export async function insertEvent(args: {
  accessToken: string
  calendarId: string
  summary: string
  description?: string
  startISO: string
  endISO: string
  attendeeEmail?: string
  attendeeName?: string
}): Promise<CreatedEvent> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(args.calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: args.summary,
        description: args.description,
        start: { dateTime: args.startISO },
        end: { dateTime: args.endISO },
        attendees: args.attendeeEmail
          ? [{ email: args.attendeeEmail, displayName: args.attendeeName }]
          : undefined,
      }),
    },
  )
  if (!res.ok) throw new Error(`Google insertEvent failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as CreatedEvent
  return data
}

/** Detect if a slot starts inside any of the busy windows (half-open intervals). */
export function isSlotBusy(slotStart: Date, slotEnd: Date, busy: BusyWindow[]): boolean {
  const s = slotStart.getTime()
  const e = slotEnd.getTime()
  return busy.some((b) => {
    const bs = Date.parse(b.start)
    const be = Date.parse(b.end)
    return s < be && e > bs
  })
}
