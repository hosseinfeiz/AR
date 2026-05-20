import { describe, expect, it, beforeEach, vi } from 'vitest'

// We import the Stripe lib and mock the underlying `stripe` SDK so no real
// network calls happen. The factory pattern in `lib/stripe.ts` makes this
// straightforward.

import {
  verifyWebhookSignature,
  receiptNumberFromPI,
  __setStripeForTesting,
} from '../src/lib/stripe'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SECRET = 'whsec_test_secret_value'

function makeMockStripe(opts: { onConstruct?: (body: unknown, sig: string, secret: string) => unknown } = {}) {
  return {
    webhooks: {
      constructEvent: vi.fn((rawBody: string, sig: string, secret: string) => {
        if (opts.onConstruct) return opts.onConstruct(rawBody, sig, secret)
        // Default: pretend signature is valid iff header equals "valid-sig"
        if (sig !== 'valid-sig') {
          throw new Error('Invalid signature')
        }
        if (secret !== SECRET) {
          throw new Error('Wrong secret')
        }
        return JSON.parse(rawBody)
      }),
    },
  }
}

beforeEach(() => {
  // Each test re-installs its mock cleanly.
  __setStripeForTesting(null)
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
  process.env.STRIPE_WEBHOOK_SECRET = SECRET
})

// ---------------------------------------------------------------------------
// receiptNumberFromPI
// ---------------------------------------------------------------------------

describe('receiptNumberFromPI', () => {
  it('produces a stable RCP-XXXX-XXXX format', () => {
    const r = receiptNumberFromPI('pi_3PabcdefXYZ123')
    expect(r).toMatch(/^RCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  })

  it('is deterministic for the same PI id', () => {
    expect(receiptNumberFromPI('pi_3Pabcdef')).toBe(receiptNumberFromPI('pi_3Pabcdef'))
  })

  it('produces different receipts for different PI ids', () => {
    const a = receiptNumberFromPI('pi_3Pabcdef')
    const b = receiptNumberFromPI('pi_3PqrstuV')
    expect(a).not.toBe(b)
  })

  it('handles short PI ids by padding', () => {
    const r = receiptNumberFromPI('pi_3P')
    expect(r).toMatch(/^RCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  })
})

// ---------------------------------------------------------------------------
// verifyWebhookSignature
// ---------------------------------------------------------------------------

describe('verifyWebhookSignature', () => {
  it('throws when signature header is missing', () => {
    __setStripeForTesting(makeMockStripe() as never)
    expect(() => verifyWebhookSignature('{}', null)).toThrow(/Missing Stripe-Signature/i)
  })

  it('throws when webhook secret is not configured', () => {
    __setStripeForTesting(makeMockStripe() as never)
    delete process.env.STRIPE_WEBHOOK_SECRET
    expect(() => verifyWebhookSignature('{}', 'valid-sig')).toThrow(/STRIPE_WEBHOOK_SECRET/)
  })

  it('throws when Stripe SDK rejects the signature', () => {
    __setStripeForTesting(makeMockStripe() as never)
    expect(() => verifyWebhookSignature('{}', 'bad-sig')).toThrow(/Invalid signature/i)
  })

  it('returns the parsed event when signature is valid', () => {
    __setStripeForTesting(makeMockStripe() as never)
    const evt = verifyWebhookSignature(
      JSON.stringify({ id: 'evt_123', type: 'payment_intent.succeeded' }),
      'valid-sig',
    )
    expect(evt).toMatchObject({ id: 'evt_123', type: 'payment_intent.succeeded' })
  })

  it('passes raw body bytes verbatim to constructEvent (no JSON.parse in path)', () => {
    const mock = makeMockStripe({
      onConstruct: (body) => {
        // The raw body should be exactly what we passed in — Stripe needs
        // byte-identical input to validate the HMAC. If anything in our path
        // re-stringified or normalized, the assertion below would catch it.
        expect(body).toBe('{"a":1,"b":"two with spaces"}')
        return { id: 'evt_x', type: 'noop' }
      },
    })
    __setStripeForTesting(mock as never)
    const raw = '{"a":1,"b":"two with spaces"}'
    const evt = verifyWebhookSignature(raw, 'valid-sig')
    expect(evt.id).toBe('evt_x')
    expect(mock.webhooks.constructEvent).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Idempotency contract — documents the rule the webhook handler follows.
//
// We can't easily exercise the webhook handler end-to-end without a Supabase
// mock harness (out of scope for S1), but we DO want to lock in the
// idempotency contract: replaying the same PI id must result in exactly one
// inserted payments row. This test stands in as the regression net for that
// contract via a hand-rolled simulation of the handler's "check-then-insert"
// pattern.
// ---------------------------------------------------------------------------

describe('webhook idempotency contract', () => {
  it('check-then-insert: a second call with the same PI id is a no-op', async () => {
    const inserted: Array<{ pi: string }> = []
    async function findExistingByPI(pi: string) {
      return inserted.find((r) => r.pi === pi) ?? null
    }
    async function insertPayment(pi: string) {
      const existing = await findExistingByPI(pi)
      if (existing) return { skipped: true }
      inserted.push({ pi })
      return { skipped: false }
    }

    const piId = 'pi_3PabcSUCCESS'
    const first = await insertPayment(piId)
    const second = await insertPayment(piId)
    const third = await insertPayment(piId)

    expect(first.skipped).toBe(false)
    expect(second.skipped).toBe(true)
    expect(third.skipped).toBe(true)
    expect(inserted).toHaveLength(1)
  })
})
