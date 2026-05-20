import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { issueRescheduleToken, tokenHashFor, verifyRescheduleToken } from '../src/lib/showings'
import { isSlotBusy } from '../src/lib/google-calendar'
import { isTwilioConfigured, sendSms } from '../src/lib/twilio'

const TEST_SECRET = 'unit-test-secret-0123456789abcdef'

describe('reschedule token round-trip', () => {
  beforeEach(() => { process.env.RESCHEDULE_SECRET = TEST_SECRET })
  afterEach(() => { delete process.env.RESCHEDULE_SECRET })

  it('issues a token that verifies for the same ref', async () => {
    const { token, hash } = await issueRescheduleToken('ABCD1234')
    const v = await verifyRescheduleToken(token)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.refId).toBe('ABCD1234')
    // Hash matches a fresh tokenHashFor call.
    expect(hash).toBe(await tokenHashFor(token))
    expect(hash).toHaveLength(64)
  })

  it('rejects a tampered signature', async () => {
    const { token } = await issueRescheduleToken('ABCD1234')
    const [body, sig] = token.split('.')
    const flipped = sig!.slice(0, -2) + (sig!.endsWith('A') ? 'B' : 'A')
    const v = await verifyRescheduleToken(`${body}.${flipped}`)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('bad_signature')
  })

  it('rejects a malformed token', async () => {
    const v = await verifyRescheduleToken('not.a.valid.token')
    expect(v.ok).toBe(false)
  })

  it('rejects with no secret configured', async () => {
    delete process.env.RESCHEDULE_SECRET
    await expect(issueRescheduleToken('X')).rejects.toThrow(/RESCHEDULE_SECRET/)
  })

  it('verify returns bad_signature when secret missing', async () => {
    process.env.RESCHEDULE_SECRET = TEST_SECRET
    const { token } = await issueRescheduleToken('ABCD1234')
    delete process.env.RESCHEDULE_SECRET
    const v = await verifyRescheduleToken(token)
    expect(v.ok).toBe(false)
  })
})

describe('isSlotBusy', () => {
  it('returns true when slot overlaps any busy window', () => {
    const busy = [{ start: '2026-06-01T15:00:00Z', end: '2026-06-01T15:30:00Z' }]
    expect(isSlotBusy(new Date('2026-06-01T14:45:00Z'), new Date('2026-06-01T15:15:00Z'), busy)).toBe(true)
    expect(isSlotBusy(new Date('2026-06-01T15:15:00Z'), new Date('2026-06-01T15:45:00Z'), busy)).toBe(true)
  })
  it('returns false when slot is fully outside busy', () => {
    const busy = [{ start: '2026-06-01T15:00:00Z', end: '2026-06-01T15:30:00Z' }]
    expect(isSlotBusy(new Date('2026-06-01T15:30:00Z'), new Date('2026-06-01T16:00:00Z'), busy)).toBe(false)
    expect(isSlotBusy(new Date('2026-06-01T14:00:00Z'), new Date('2026-06-01T15:00:00Z'), busy)).toBe(false)
  })
  it('handles empty busy list', () => {
    expect(isSlotBusy(new Date(), new Date(Date.now() + 60_000), [])).toBe(false)
  })
})

describe('twilio env gating', () => {
  it('isTwilioConfigured is false with no env', () => {
    expect(isTwilioConfigured({})).toBe(false)
  })
  it('isTwilioConfigured is true with full env', () => {
    expect(isTwilioConfigured({
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'tok',
      TWILIO_FROM_NUMBER: '+15555550100',
    })).toBe(true)
  })
  it('sendSms returns skipped when env unset (no network call)', async () => {
    const res = await sendSms({ to: '+15555551212', body: 'hi' }, {})
    expect(res.ok).toBe(true)
    expect(res.skipped).toBe(true)
  })
})
