// Twilio SMS sender — env-gated.
//
// If TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER is unset, calls
// to sendSms() return { ok: true, skipped: true } and log a warning. This means
// reminder code can call sendSms unconditionally without branching everywhere.

export interface SmsArgs {
  to: string
  body: string
}

export interface SmsResult {
  ok: boolean
  skipped?: boolean
  sid?: string
  error?: string
}

interface TwilioEnv {
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_FROM_NUMBER?: string
}

function getTwilioEnv(env?: Record<string, string | undefined>): TwilioEnv {
  const src = env ?? (process.env as Record<string, string | undefined>)
  return {
    TWILIO_ACCOUNT_SID: src.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: src.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: src.TWILIO_FROM_NUMBER,
  }
}

export function isTwilioConfigured(env?: Record<string, string | undefined>): boolean {
  const t = getTwilioEnv(env)
  return Boolean(t.TWILIO_ACCOUNT_SID && t.TWILIO_AUTH_TOKEN && t.TWILIO_FROM_NUMBER)
}

export async function sendSms(args: SmsArgs, env?: Record<string, string | undefined>): Promise<SmsResult> {
  const t = getTwilioEnv(env)
  if (!t.TWILIO_ACCOUNT_SID || !t.TWILIO_AUTH_TOKEN || !t.TWILIO_FROM_NUMBER) {
    // eslint-disable-next-line no-console
    console.warn('[twilio] SMS skipped — env not configured', { to: args.to, len: args.body.length })
    return { ok: true, skipped: true }
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${t.TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams()
  params.set('To', args.to)
  params.set('From', t.TWILIO_FROM_NUMBER)
  params.set('Body', args.body)

  const basic =
    typeof btoa === 'function'
      ? btoa(`${t.TWILIO_ACCOUNT_SID}:${t.TWILIO_AUTH_TOKEN}`)
      : Buffer.from(`${t.TWILIO_ACCOUNT_SID}:${t.TWILIO_AUTH_TOKEN}`).toString('base64')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    if (!res.ok) {
      const txt = await res.text()
      return { ok: false, error: `Twilio ${res.status}: ${txt}` }
    }
    const data = (await res.json()) as { sid?: string }
    return { ok: true, sid: data.sid }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
