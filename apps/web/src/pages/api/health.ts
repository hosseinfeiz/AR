export const prerender = false
import type { APIRoute } from 'astro'
import { supabase } from '../../lib/supabase'
import { isMockMode } from '../../lib/fixtures'

interface DependencyResult {
  ok: boolean | null
  latency_ms?: number
  note?: string
  error?: string
}

interface HealthResponse {
  ok: boolean
  ts: string
  request_id: string
  dependencies: {
    supabase: DependencyResult
    resend: DependencyResult
    sentry: DependencyResult
  }
  degraded: boolean
  mock: boolean
}

async function checkSupabase(): Promise<DependencyResult> {
  const started = Date.now()
  try {
    const { error } = await supabase.from('buildings').select('id').limit(1)
    const latency_ms = Date.now() - started
    if (error) return { ok: false, latency_ms, error: error.message }
    return { ok: true, latency_ms }
  } catch (e) {
    return {
      ok: false,
      latency_ms: Date.now() - started,
      error: (e as Error).message,
    }
  }
}

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

async function checkResend(apiKey: string | undefined): Promise<DependencyResult> {
  if (!apiKey) return { ok: null, note: 'unconfigured' }
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    })
    const latency_ms = Date.now() - started
    if (!res.ok) {
      return { ok: false, latency_ms, error: `Resend ${res.status}` }
    }
    return { ok: true, latency_ms }
  } catch (e) {
    return {
      ok: false,
      latency_ms: Date.now() - started,
      error: (e as Error).message,
    }
  } finally {
    clearTimeout(timer)
  }
}

export const GET: APIRoute = async ({ locals }) => {
  const log = locals.log
  const requestId = locals.requestId ?? ''
  const mock = isMockMode()

  // Supabase: skip the network round-trip in mock mode and report it cleanly.
  const supabaseResult: DependencyResult = mock
    ? { ok: null, note: 'mock mode (no Supabase configured)' }
    : await checkSupabase()

  const env = envFor(locals)
  const resendResult = await checkResend(env.RESEND_API_KEY)

  const sentryResult: DependencyResult = { ok: null, note: 'not checked from server' }

  if (supabaseResult.ok === false) {
    log?.warn('health: supabase check failed', { error: supabaseResult.error })
  }
  if (resendResult.ok === false) {
    log?.warn('health: resend check failed', { error: resendResult.error })
  }

  const degraded =
    supabaseResult.ok === false || resendResult.ok === false

  const body: HealthResponse = {
    ok: !degraded,
    ts: new Date().toISOString(),
    request_id: requestId,
    dependencies: {
      supabase: supabaseResult,
      resend: resendResult,
      sentry: sentryResult,
    },
    degraded,
    mock,
  }

  return new Response(JSON.stringify(body), {
    status: degraded ? 503 : 200,
    headers: { 'content-type': 'application/json' },
  })
}
