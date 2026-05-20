import { describe, expect, it } from 'vitest'
import {
  computeSla,
  formatRemaining,
  SLA_THRESHOLDS,
} from '../src/lib/sla'

const T0 = new Date('2026-05-20T00:00:00Z')

describe('SLA_THRESHOLDS', () => {
  it('matches the documented thresholds (minutes)', () => {
    expect(SLA_THRESHOLDS.emergency.ack_minutes).toBe(30)
    expect(SLA_THRESHOLDS.emergency.start_minutes).toBe(240)
    expect(SLA_THRESHOLDS.emergency.complete_minutes).toBe(24 * 60)
    expect(SLA_THRESHOLDS.high.ack_minutes).toBe(240)
    expect(SLA_THRESHOLDS.high.start_minutes).toBe(24 * 60)
    expect(SLA_THRESHOLDS.high.complete_minutes).toBe(72 * 60)
    expect(SLA_THRESHOLDS.normal.ack_minutes).toBe(24 * 60)
    expect(SLA_THRESHOLDS.normal.start_minutes).toBe(5 * 24 * 60)
    expect(SLA_THRESHOLDS.normal.complete_minutes).toBe(14 * 24 * 60)
    expect(SLA_THRESHOLDS.low.ack_minutes).toBe(7 * 24 * 60)
    expect(SLA_THRESHOLDS.low.start_minutes).toBe(14 * 24 * 60)
    expect(SLA_THRESHOLDS.low.complete_minutes).toBe(30 * 24 * 60)
  })
})

describe('computeSla', () => {
  it('reports on-track when a fresh request has nothing due yet', () => {
    const s = computeSla({
      urgency: 'normal',
      created_at: T0,
      now: new Date(T0.getTime() + 60 * 60 * 1000), // 1h later
    })
    expect(s.ack.bucket).toBe('on-track')
    expect(s.start.bucket).toBe('on-track')
    expect(s.complete.bucket).toBe('on-track')
    expect(s.overall).toBe('on-track')
  })

  it('reports breached when an emergency request was not acknowledged in 30 min', () => {
    const s = computeSla({
      urgency: 'emergency',
      created_at: T0,
      now: new Date(T0.getTime() + 60 * 60 * 1000), // 1h later, no ack
    })
    expect(s.ack.bucket).toBe('breached')
    expect(s.overall).toBe('breached')
  })

  it('reports warning when ≥75% of the budget elapsed and the milestone is unmet', () => {
    // emergency ack budget = 30 min. 75% = 22.5 min.
    const s = computeSla({
      urgency: 'emergency',
      created_at: T0,
      now: new Date(T0.getTime() + 25 * 60 * 1000), // 25 min — past warning threshold
    })
    expect(s.ack.bucket).toBe('warning')
  })

  it('flips ack to on-track once acknowledged before the deadline', () => {
    const s = computeSla({
      urgency: 'high',
      created_at: T0,
      acknowledged_at: new Date(T0.getTime() + 2 * 60 * 60 * 1000), // 2h
      now: new Date(T0.getTime() + 3 * 60 * 60 * 1000),
    })
    expect(s.ack.bucket).toBe('on-track')
    expect(s.ack.met_at).not.toBeNull()
  })

  it('marks ack breached even when acknowledgement comes after the deadline', () => {
    const s = computeSla({
      urgency: 'emergency',
      created_at: T0,
      acknowledged_at: new Date(T0.getTime() + 45 * 60 * 1000), // 15 min late
      now: new Date(T0.getTime() + 60 * 60 * 1000),
    })
    expect(s.ack.bucket).toBe('breached')
  })

  it('uses vendor_assigned_at as the start signal when started_at is absent', () => {
    const s = computeSla({
      urgency: 'high',
      created_at: T0,
      vendor_assigned_at: new Date(T0.getTime() + 60 * 60 * 1000), // 1h after create
      now: new Date(T0.getTime() + 2 * 60 * 60 * 1000),
    })
    expect(s.start.bucket).toBe('on-track')
    expect(s.start.met_at).not.toBeNull()
  })

  it('rolls overall to worst of (ack, start, complete)', () => {
    const s = computeSla({
      urgency: 'low',
      created_at: T0,
      acknowledged_at: new Date(T0.getTime() + 60 * 60 * 1000),
      vendor_assigned_at: new Date(T0.getTime() + 2 * 60 * 60 * 1000),
      now: new Date(T0.getTime() + 35 * 24 * 60 * 60 * 1000), // 35 days
    })
    // ack/start both met early; complete unmet @ 35d > 30d budget → breached
    expect(s.complete.bucket).toBe('breached')
    expect(s.overall).toBe('breached')
  })
})

describe('formatRemaining', () => {
  it('formats hours and minutes when below a day', () => {
    expect(formatRemaining(3 * 60 + 15)).toBe('3h 15m')
  })
  it('formats days when above a day', () => {
    expect(formatRemaining(2 * 24 * 60 + 4 * 60)).toBe('2d 4h')
  })
  it('prefixes "overdue" for negative remaining', () => {
    expect(formatRemaining(-90)).toBe('overdue 1h 30m')
  })
})
