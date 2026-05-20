// Tenant screening — TransUnion SmartMove client + mock fallback.
//
// Live mode is enabled when SMARTMOVE_API_KEY is set. Otherwise the mock
// returns a deterministic-but-randomish score derived from the applicant id,
// with a sensible recommendation. Mock mode lets the pipeline run end-to-end
// in dev with no external dependencies.
//
// We only model the request/response shape we need:
//   request  → { applicant_id, name, email }
//   response → { provider_ref, score, recommendation, raw }
//
// Real SmartMove API:
//   - https://api.transunion.com/smartmove/v2/applicants
//   - Bearer auth, JSON in/out.
//   - Returns an "Application URL" + later a score via webhook OR polling.
// Production should switch to async-webhook flow; this stub uses the synchronous
// "instant decision" sandbox path so the API is one round trip.

export interface ScreeningRequest {
  applicant_id: string
  name: string
  email: string
  monthly_income_cents?: number | null
}

export type ScreeningRecommendation = 'accept' | 'review' | 'decline'

export interface ScreeningResponse {
  provider_ref: string
  score: number                       // 0-850 FICO-ish range
  recommendation: ScreeningRecommendation
  mock: boolean
  raw?: unknown
}

const SMARTMOVE_ENDPOINT = 'https://api.transunion.com/smartmove/v2/applicants'

/** Deterministic hash → integer in [0, 2^31) */
function hash(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

function recommend(score: number): ScreeningRecommendation {
  if (score >= 680) return 'accept'
  if (score >= 600) return 'review'
  return 'decline'
}

/**
 * Mock screening — deterministic score in [500, 800].
 * Same applicant_id always yields the same score (handy for tests).
 */
export function mockScreening(req: ScreeningRequest): ScreeningResponse {
  const seed = hash(req.applicant_id + '|' + req.email)
  const score = 500 + (seed % 301) // 500..800 inclusive
  return {
    provider_ref: `mock-sm-${req.applicant_id.slice(0, 12)}`,
    score,
    recommendation: recommend(score),
    mock: true,
  }
}

/**
 * Run a screening — live SmartMove if SMARTMOVE_API_KEY is set, otherwise mock.
 *
 * In live mode the request is best-effort: if the network call fails we log
 * and fall back to the mock so the operator workflow can proceed.
 */
export async function runScreening(
  req: ScreeningRequest,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<ScreeningResponse> {
  const apiKey = env.SMARTMOVE_API_KEY
  if (!apiKey) return mockScreening(req)

  try {
    const res = await fetchImpl(SMARTMOVE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        applicant_id: req.applicant_id,
        name: req.name,
        email: req.email,
        monthly_income_cents: req.monthly_income_cents ?? null,
      }),
    })

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[screening] SmartMove ${res.status}; falling back to mock`)
      return mockScreening(req)
    }

    const raw = (await res.json()) as {
      reference_id?: string
      score?: number
      recommendation?: string
    }

    const score = typeof raw.score === 'number' ? raw.score : 0
    const rec: ScreeningRecommendation =
      raw.recommendation === 'accept' || raw.recommendation === 'review' || raw.recommendation === 'decline'
        ? raw.recommendation
        : recommend(score)

    return {
      provider_ref: raw.reference_id ?? `sm-${req.applicant_id.slice(0, 12)}`,
      score,
      recommendation: rec,
      mock: false,
      raw,
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[screening] SmartMove call failed; using mock. Reason: ${(e as Error).message}`)
    return mockScreening(req)
  }
}
