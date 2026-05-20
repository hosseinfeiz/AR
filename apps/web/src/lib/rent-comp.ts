// Rent-comparison helper. Wraps the Rentometer API
// (https://www.rentometer.com/api) with a graceful fallback when
// RENTOMETER_API_KEY is unset.
//
// Strategy
// • If the key is set we hit Rentometer's /v1/summary endpoint with the
//   building's address and unit's bedroom count. Results are normalized
//   into { mean_cents, median_cents, p25_cents, p75_cents, samples }.
// • If the key is unset (or the API errors / returns too few samples), we
//   compute a coarse local mock: median = monthly_rent_cents, range ±15%.
//   The UI must surface that the figure is a fallback (use the `source`
//   field for that).

import type { APIContext } from 'astro'

export interface RentCompInput {
  /** Street + unit-less address line, e.g. "928 Rae Drive". */
  address: string
  city: string
  state: string
  postal_code: string
  bedrooms: number
  /** The unit's own current rent, in cents. Used for both the comparison
   *  and to compute the mock fallback when no API key is configured. */
  unit_rent_cents: number
}

export type RentCompSource = 'rentometer' | 'mock-fallback' | 'unavailable'

export interface RentCompResult {
  source: RentCompSource
  mean_cents: number
  median_cents: number
  p25_cents: number
  p75_cents: number
  samples: number
  /** Positive = unit rents above market (in cents). Negative = below. */
  delta_vs_median_cents: number
  /** Same as above, expressed as a percentage of median. */
  delta_vs_median_pct: number
  /** ISO timestamp the data was fetched. */
  fetched_at: string
  /** Optional human-readable note (e.g. "fewer than 5 comps; results imprecise"). */
  note?: string
}

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

export interface RentCompCtx {
  apiKey: string | undefined
  log: (level: 'info' | 'warn' | 'error', msg: string, fields?: Record<string, unknown>) => void
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch
}

export function rentCompCtx(astroCtx: Pick<APIContext, 'locals'>): RentCompCtx {
  const env = envFor(astroCtx.locals)
  return {
    apiKey: env.RENTOMETER_API_KEY,
    log: (level, msg, fields) => {
      const line = `[rent-comp] ${msg}`
      // eslint-disable-next-line no-console
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
      fn(line, fields ?? {})
    },
  }
}

// ─── Mock fallback ────────────────────────────────────────────────────────

/**
 * Deterministic mock: ±15% band around the unit's current rent. Useful so
 * the UI keeps working without a Rentometer key.
 */
export function mockRentComp(input: RentCompInput): RentCompResult {
  const median = input.unit_rent_cents
  const p25 = Math.round(median * 0.85)
  const p75 = Math.round(median * 1.15)
  return {
    source: 'mock-fallback',
    mean_cents: median,
    median_cents: median,
    p25_cents: p25,
    p75_cents: p75,
    samples: 0,
    delta_vs_median_cents: 0,
    delta_vs_median_pct: 0,
    fetched_at: new Date().toISOString(),
    note: 'Mock data — set RENTOMETER_API_KEY for real comps.',
  }
}

// ─── Rentometer client ────────────────────────────────────────────────────

interface RentometerSummary {
  address?: string
  bedrooms?: number
  samples?: number
  mean?: number
  median?: number
  percentile_25?: number
  percentile_75?: number
  // Some Rentometer endpoints use these camelCase keys; tolerate both.
  percentile25?: number
  percentile75?: number
  credits?: number
}

function dollarsToCents(d: number | undefined): number {
  if (typeof d !== 'number' || !Number.isFinite(d)) return 0
  return Math.round(d * 100)
}

export async function fetchRentComp(
  ctx: RentCompCtx,
  input: RentCompInput,
): Promise<RentCompResult> {
  if (!ctx.apiKey) {
    ctx.log('warn', 'RENTOMETER_API_KEY not set; returning mock-fallback')
    return mockRentComp(input)
  }
  const fetcher = ctx.fetchImpl ?? fetch
  const params = new URLSearchParams({
    api_key: ctx.apiKey,
    address: `${input.address}, ${input.city}, ${input.state} ${input.postal_code}`,
    bedrooms: String(input.bedrooms),
  })
  const url = `https://www.rentometer.com/api/v1/summary?${params.toString()}`
  const started = Date.now()
  try {
    const res = await fetcher(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      ctx.log('warn', 'Rentometer responded non-OK; falling back to mock', {
        status: res.status,
        ms: Date.now() - started,
      })
      const fallback = mockRentComp(input)
      fallback.note = `Rentometer ${res.status}; using fallback estimate.`
      return fallback
    }
    const body = (await res.json()) as RentometerSummary
    const samples = body.samples ?? 0
    if (samples < 3) {
      ctx.log('info', 'Rentometer returned too few comps; falling back', { samples })
      const fallback = mockRentComp(input)
      fallback.note = `Only ${samples} comp${samples === 1 ? '' : 's'} found; showing fallback estimate.`
      return fallback
    }
    const median = dollarsToCents(body.median)
    const mean = dollarsToCents(body.mean ?? body.median)
    const p25 = dollarsToCents(body.percentile_25 ?? body.percentile25 ?? body.median)
    const p75 = dollarsToCents(body.percentile_75 ?? body.percentile75 ?? body.median)
    const delta = input.unit_rent_cents - median
    const pct = median > 0 ? Math.round((delta / median) * 1000) / 10 : 0
    ctx.log('info', 'Rentometer ok', { ms: Date.now() - started, samples })
    return {
      source: 'rentometer',
      mean_cents: mean,
      median_cents: median,
      p25_cents: p25,
      p75_cents: p75,
      samples,
      delta_vs_median_cents: delta,
      delta_vs_median_pct: pct,
      fetched_at: new Date().toISOString(),
    }
  } catch (e) {
    ctx.log('error', 'Rentometer call threw; falling back to mock', {
      err: (e as Error).message,
      ms: Date.now() - started,
    })
    const fallback = mockRentComp(input)
    fallback.note = 'Rentometer unreachable; using fallback estimate.'
    return fallback
  }
}

/** Human-readable summary, used by the badge component. */
export function summarizeRentComp(r: RentCompResult): string {
  if (r.source === 'mock-fallback') {
    return `Estimated $${(r.p25_cents / 100).toFixed(0)}–$${(r.p75_cents / 100).toFixed(0)}/mo (no comps)`
  }
  if (r.source === 'unavailable') return 'Market rent unavailable.'
  const lo = (r.p25_cents / 100).toFixed(0)
  const hi = (r.p75_cents / 100).toFixed(0)
  const dir = r.delta_vs_median_pct === 0 ? 'at market' : r.delta_vs_median_pct > 0 ? `${r.delta_vs_median_pct}% above market` : `${Math.abs(r.delta_vs_median_pct)}% below market`
  return `Market $${lo}–$${hi}/mo · ${dir}`
}
