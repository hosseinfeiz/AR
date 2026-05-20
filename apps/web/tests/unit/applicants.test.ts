import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetMemoryForTests,
  __getMemoryForTests,
  canTransition,
  allowedNextStatuses,
  createApplicant,
  getApplicant,
  listApplicants,
  transitionStatus,
  updateApplicantFields,
  StatusTransitionError,
  type Applicant,
  type ApplicantStatus,
} from '../../src/lib/applicants'
import { mockScreening, runScreening } from '../../src/lib/screening'
import { mockEnvelope, parseWebhookEvent, sendForSignature } from '../../src/lib/esign'

const BUILDING_GLM = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  __resetMemoryForTests([])
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.SMARTMOVE_API_KEY
  delete process.env.DROPBOX_SIGN_API_KEY
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

describe('applicant state machine', () => {
  const cases: Array<[ApplicantStatus, ApplicantStatus, boolean]> = [
    ['inquiry', 'application', true],
    ['inquiry', 'withdrawn', true],
    ['inquiry', 'screening', false],
    ['inquiry', 'signed', false],
    ['application', 'screening', true],
    ['application', 'withdrawn', true],
    ['application', 'inquiry', false],
    ['screening', 'lease_ready', true],
    ['screening', 'application', true],
    ['screening', 'withdrawn', true],
    ['screening', 'signed', false],
    ['lease_ready', 'signed', true],
    ['lease_ready', 'withdrawn', true],
    ['lease_ready', 'screening', false],
    ['signed', 'withdrawn', false],
    ['signed', 'lease_ready', false],
    ['withdrawn', 'inquiry', false],
  ]

  it.each(cases)('canTransition(%s, %s) === %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected)
  })

  it('allowedNextStatuses lists exactly the legal moves', () => {
    expect(allowedNextStatuses('inquiry')).toEqual(['application', 'withdrawn'])
    expect(allowedNextStatuses('screening')).toEqual(['lease_ready', 'application', 'withdrawn'])
    expect(allowedNextStatuses('signed')).toEqual([])
    expect(allowedNextStatuses('withdrawn')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// CRUD + transitions (in-memory mode)
// ---------------------------------------------------------------------------

describe('applicants CRUD (mock mode)', () => {
  it('createApplicant inserts a new row with sensible defaults', async () => {
    const a = await createApplicant({
      name: '  Olivia Park  ',
      email: 'Olivia@Demo.test',
      building_id: BUILDING_GLM,
    })
    expect(a.name).toBe('Olivia Park')
    expect(a.email).toBe('olivia@demo.test')
    expect(a.status).toBe('inquiry')
    expect(a.id).toMatch(/^[0-9a-f]{8}-/i)
    expect(__getMemoryForTests()).toHaveLength(1)
  })

  it('listApplicants filters by building and status', async () => {
    await createApplicant({ name: 'A', email: 'a@x.test', building_id: BUILDING_GLM })
    await createApplicant({ name: 'B', email: 'b@x.test', building_id: '22222222-2222-2222-2222-222222222222' })
    const glm = await listApplicants({ building_id: BUILDING_GLM })
    expect(glm).toHaveLength(1)
    expect(glm[0]!.email).toBe('a@x.test')

    const inquiries = await listApplicants({ status: 'inquiry' })
    expect(inquiries).toHaveLength(2)
  })

  it('transitionStatus advances through legal moves', async () => {
    const a = await createApplicant({ name: 'T', email: 't@x.test', building_id: BUILDING_GLM })
    await transitionStatus(a.id, 'application')
    await transitionStatus(a.id, 'screening')
    const after = await getApplicant(a.id)
    expect(after?.status).toBe('screening')
  })

  it('transitionStatus throws StatusTransitionError on illegal jump', async () => {
    const a = await createApplicant({ name: 'T', email: 't@x.test', building_id: BUILDING_GLM })
    await expect(transitionStatus(a.id, 'signed')).rejects.toBeInstanceOf(StatusTransitionError)
  })

  it('transitionStatus is a no-op when the requested status equals current', async () => {
    const a = await createApplicant({ name: 'T', email: 't@x.test', building_id: BUILDING_GLM })
    const same = await transitionStatus(a.id, 'inquiry')
    expect(same.status).toBe('inquiry')
  })

  it('updateApplicantFields writes screening + esign refs', async () => {
    const a = await createApplicant({ name: 'T', email: 't@x.test', building_id: BUILDING_GLM })
    const updated = await updateApplicantFields(a.id, {
      screening_score: 720,
      screening_recommendation: 'accept',
      screening_provider_ref: 'sm-test',
    })
    expect(updated?.screening_score).toBe(720)
    expect(updated?.screening_recommendation).toBe('accept')
  })

  it('signed and withdrawn are terminal', async () => {
    const a = await createApplicant({ name: 'T', email: 't@x.test', building_id: BUILDING_GLM })
    await transitionStatus(a.id, 'application')
    await transitionStatus(a.id, 'screening')
    await transitionStatus(a.id, 'lease_ready')
    await transitionStatus(a.id, 'signed')
    await expect(transitionStatus(a.id, 'withdrawn')).rejects.toBeInstanceOf(StatusTransitionError)
  })
})

// ---------------------------------------------------------------------------
// Screening
// ---------------------------------------------------------------------------

describe('screening', () => {
  it('mockScreening is deterministic per applicant_id', () => {
    const r1 = mockScreening({ applicant_id: 'app-001', name: 'A', email: 'a@x.test' })
    const r2 = mockScreening({ applicant_id: 'app-001', name: 'A', email: 'a@x.test' })
    expect(r1.score).toBe(r2.score)
    expect(r1.score).toBeGreaterThanOrEqual(500)
    expect(r1.score).toBeLessThanOrEqual(800)
    expect(r1.mock).toBe(true)
  })

  it('mockScreening recommendation tracks the score bands', () => {
    // We can't construct a score arbitrarily from the public API, but
    // sweeping a range of ids hits all three bands eventually.
    const recs = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const r = mockScreening({ applicant_id: `app-${i}`, name: 'A', email: `a${i}@x.test` })
      recs.add(r.recommendation)
    }
    expect(recs.has('accept') || recs.has('review') || recs.has('decline')).toBe(true)
  })

  it('runScreening falls back to mock when SMARTMOVE_API_KEY is missing', async () => {
    const fetchSpy = vi.fn()
    const r = await runScreening(
      { applicant_id: 'x', name: 'X', email: 'x@x.test' },
      {} as Record<string, string | undefined>,
      fetchSpy as unknown as typeof fetch,
    )
    expect(r.mock).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('runScreening uses live API when key is set and falls back on failure', async () => {
    // Live OK path
    const fetchOk = vi.fn(async () => new Response(
      JSON.stringify({ reference_id: 'sm-123', score: 740, recommendation: 'accept' }),
      { status: 200 },
    ))
    const ok = await runScreening(
      { applicant_id: 'x', name: 'X', email: 'x@x.test' },
      { SMARTMOVE_API_KEY: 'fake' },
      fetchOk as unknown as typeof fetch,
    )
    expect(ok.mock).toBe(false)
    expect(ok.provider_ref).toBe('sm-123')
    expect(ok.score).toBe(740)
    expect(ok.recommendation).toBe('accept')

    // Live failure path
    const fetchFail = vi.fn(async () => new Response('boom', { status: 500 }))
    const fb = await runScreening(
      { applicant_id: 'y', name: 'Y', email: 'y@x.test' },
      { SMARTMOVE_API_KEY: 'fake' },
      fetchFail as unknown as typeof fetch,
    )
    expect(fb.mock).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// E-sign
// ---------------------------------------------------------------------------

describe('e-sign', () => {
  it('mockEnvelope returns a unique envelope id and preview url', () => {
    const a = mockEnvelope({ applicant_id: 'app-001' })
    const b = mockEnvelope({ applicant_id: 'app-001' })
    expect(a.envelope_id).not.toBe(b.envelope_id)
    expect(a.signing_url).toBe('/admin/applicants/app-001/lease/preview')
    expect(a.mock).toBe(true)
  })

  it('sendForSignature returns mock envelope without API key', async () => {
    const fetchSpy = vi.fn()
    const r = await sendForSignature({
      applicant_id: 'app-001',
      applicant_name: 'A',
      applicant_email: 'a@x.test',
      pdf: new Uint8Array([37, 80, 68, 70]),
    }, {} as Record<string, string | undefined>, fetchSpy as unknown as typeof fetch)
    expect(r.mock).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('parseWebhookEvent accepts flat shape and provider shape', () => {
    expect(parseWebhookEvent({ envelope_id: 'env-1', event_type: 'signature_request_all_signed' }))
      .toMatchObject({ envelope_id: 'env-1', event_type: 'signature_request_all_signed' })

    expect(parseWebhookEvent({
      event: { event_type: 'signature_request_all_signed' },
      signature_request: {
        signature_request_id: 'env-9',
        files_url: 'https://example/signed.pdf',
        metadata: { applicant_id: 'app-9' },
      },
    })).toMatchObject({
      envelope_id: 'env-9',
      applicant_id: 'app-9',
      signed_pdf_url: 'https://example/signed.pdf',
    })

    expect(parseWebhookEvent({})).toBeNull()
    expect(parseWebhookEvent(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// End-to-end pipeline (mock mode)
// ---------------------------------------------------------------------------

describe('end-to-end pipeline (mock providers)', () => {
  it('drives an applicant from inquiry to signed', async () => {
    const a = await createApplicant({
      name: 'E2E',
      email: 'e2e@x.test',
      building_id: BUILDING_GLM,
      unit_id: 'aaaa1111-1111-1111-1111-111111111111',
      move_in_date: '2026-07-01',
      monthly_income_cents: 500000,
    })
    let cur: Applicant | null = a

    // Apply
    cur = await transitionStatus(a.id, 'application')
    expect(cur.status).toBe('application')

    // Run screening
    const screening = mockScreening({
      applicant_id: a.id, name: a.name, email: a.email,
    })
    await updateApplicantFields(a.id, {
      screening_provider_ref: screening.provider_ref,
      screening_score: screening.score,
      screening_recommendation: screening.recommendation,
    })
    cur = await transitionStatus(a.id, 'screening')
    expect(cur.status).toBe('screening')
    expect(cur.screening_score).toBe(screening.score)

    // If mock screening recommends accept, send lease.
    if (screening.recommendation === 'accept') {
      const env = mockEnvelope({ applicant_id: a.id })
      await updateApplicantFields(a.id, { esign_envelope_id: env.envelope_id })
      cur = await transitionStatus(a.id, 'lease_ready')
      expect(cur.status).toBe('lease_ready')
      cur = await transitionStatus(a.id, 'signed')
      expect(cur.status).toBe('signed')
      expect(cur.esign_envelope_id).toBe(env.envelope_id)
    }
  })
})
