import { describe, it, expect } from 'vitest'
import {
  shouldDeliverNow,
  isInQuietHours,
  passesFilters,
  DEFAULT_PREFS,
  type ManagerPreferences,
} from '../../src/lib/notifications'
import {
  renderManagerNotification,
  renderSubmitterConfirmation,
  renderBatchedDigest,
} from '../../src/lib/email-templates'

function prefs(over: Partial<ManagerPreferences> = {}): ManagerPreferences {
  return { ...DEFAULT_PREFS, manager_email: 'm@example.com', ...over }
}

describe('shouldDeliverNow', () => {
  it('delivers immediately when no preferences exist', () => {
    const r = shouldDeliverNow({ prefs: null, urgency: 'normal' })
    expect(r.deliverNow).toBe(true)
    expect(r.reason).toBe('no-prefs')
  })

  it('always delivers emergencies even with batching enabled', () => {
    const r = shouldDeliverNow({
      prefs: prefs({ batch_after_count: 10 }),
      urgency: 'emergency',
    })
    expect(r.deliverNow).toBe(true)
    expect(r.reason).toBe('emergency-override')
  })

  it('defers during quiet hours', () => {
    // Quiet hours 22:00–07:00; "now" 03:30
    const now = new Date('2026-05-20T03:30:00Z')
    const r = shouldDeliverNow({
      prefs: prefs({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' }),
      urgency: 'normal',
      now,
    })
    expect(r.deliverNow).toBe(false)
    expect(r.reason).toBe('quiet-hours')
  })

  it('defers when batch_after_count > 1', () => {
    const r = shouldDeliverNow({ prefs: prefs({ batch_after_count: 5 }), urgency: 'normal' })
    expect(r.deliverNow).toBe(false)
    expect(r.reason).toBe('batch-window')
  })

  it('defers when filters reject the urgency', () => {
    const r = shouldDeliverNow({
      prefs: prefs({ filters: { urgencies: ['emergency'] } }),
      urgency: 'normal',
    })
    expect(r.deliverNow).toBe(false)
    expect(r.reason).toBe('filtered-out')
  })

  it('delivers when filters accept the urgency and batch_after_count is 1', () => {
    const r = shouldDeliverNow({
      prefs: prefs({ filters: { urgencies: ['emergency', 'high', 'normal'] } }),
      urgency: 'normal',
    })
    expect(r.deliverNow).toBe(true)
    expect(r.reason).toBe('send-now')
  })
})

describe('isInQuietHours', () => {
  it('returns false when either bound is null', () => {
    expect(isInQuietHours(new Date('2026-05-20T03:00:00Z'), null, '07:00')).toBe(false)
    expect(isInQuietHours(new Date('2026-05-20T03:00:00Z'), '22:00', null)).toBe(false)
  })

  it('handles same-day windows', () => {
    const t = new Date('2026-05-20T14:30:00Z')
    expect(isInQuietHours(t, '13:00', '17:00')).toBe(true)
    expect(isInQuietHours(t, '15:00', '17:00')).toBe(false)
  })

  it('handles overnight windows', () => {
    const t = new Date('2026-05-20T03:00:00Z')
    expect(isInQuietHours(t, '22:00', '07:00')).toBe(true)
    const t2 = new Date('2026-05-20T08:00:00Z')
    expect(isInQuietHours(t2, '22:00', '07:00')).toBe(false)
  })

  it('treats start === end as no-window', () => {
    expect(isInQuietHours(new Date('2026-05-20T22:00:00Z'), '22:00', '22:00')).toBe(false)
  })
})

describe('passesFilters', () => {
  it('passes when no filters are set', () => {
    expect(passesFilters({}, { urgency: 'normal' })).toBe(true)
  })

  it('passes when urgency is in the allow-list', () => {
    expect(passesFilters({ urgencies: ['high', 'emergency'] }, { urgency: 'high' })).toBe(true)
  })

  it('rejects when urgency is not in the allow-list', () => {
    expect(passesFilters({ urgencies: ['emergency'] }, { urgency: 'normal' })).toBe(false)
  })

  it('passes when kind is in the allow-list', () => {
    expect(
      passesFilters({ kinds: ['maintenance_request'] }, { kind: 'maintenance_request' }),
    ).toBe(true)
  })

  it('ignores empty arrays', () => {
    expect(passesFilters({ urgencies: [] }, { urgency: 'normal' })).toBe(true)
  })
})

describe('renderManagerNotification', () => {
  it('returns subject and html', () => {
    const r = renderManagerNotification({
      type: 'maintenance',
      ref_id: 'M-001',
      building_name: 'Maple Court',
      details: { Unit: '101', Tenant: 'Jane' },
      studio_url: 'https://example.com/studio',
    })
    expect(r.subject).toContain('[AR Management]')
    expect(r.subject).toContain('Maple Court')
    expect(r.subject).toContain('M-001')
    expect(r.html).toContain('<!doctype html>')
    expect(r.html).toContain('Jane')
    expect(r.html).toContain('Open in Supabase')
  })

  it('marks emergency requests', () => {
    const r = renderManagerNotification({
      type: 'maintenance',
      ref_id: 'M-002',
      building_name: 'Maple Court',
      details: {},
      studio_url: 'x',
      is_emergency: true,
    })
    expect(r.subject.startsWith('[EMERGENCY]')).toBe(true)
    expect(r.html).toContain('EMERGENCY')
  })

  it('escapes HTML in details', () => {
    const r = renderManagerNotification({
      type: 'showing',
      ref_id: 'S-001',
      building_name: 'Oak',
      details: { Note: '<script>alert(1)</script>' },
      studio_url: 'x',
    })
    expect(r.html).not.toContain('<script>alert(1)</script>')
    expect(r.html).toContain('&lt;script&gt;')
  })
})

describe('renderSubmitterConfirmation', () => {
  it('includes the ref id and name', () => {
    const r = renderSubmitterConfirmation({
      type: 'showing',
      ref_id: 'S-001',
      recipient_name: 'Pat',
    })
    expect(r.subject).toContain('We received')
    expect(r.html).toContain('Pat')
    expect(r.html).toContain('S-001')
  })
})

describe('renderBatchedDigest', () => {
  it('renders a card per item with summary and link', () => {
    const r = renderBatchedDigest({
      recipient_email: 'm@example.com',
      generated_at: '2026-05-20T12:00:00Z',
      items: [
        {
          kind: 'maintenance_request',
          ref_id: 'M-100',
          title: 'New maintenance request',
          summary: '101 · plumbing · emergency',
          created_at: '2026-05-20T11:55:00Z',
          studio_url: 'https://example.com/studio',
        },
        {
          kind: 'showing_request',
          ref_id: 'S-200',
          title: 'New showing request',
          summary: 'Pat · pat@example.com',
          created_at: '2026-05-20T11:58:00Z',
        },
      ],
    })
    expect(r.subject).toContain('Digest')
    expect(r.subject).toContain('2 new items')
    expect(r.html).toContain('M-100')
    expect(r.html).toContain('S-200')
    expect(r.html).toContain('plumbing')
    expect(r.html).toContain('Open in Supabase')
  })

  it('uses singular for 1 item', () => {
    const r = renderBatchedDigest({
      recipient_email: 'm@example.com',
      generated_at: '2026-05-20T12:00:00Z',
      items: [
        {
          kind: 'system',
          title: 'Hello',
          summary: 'Hi',
          created_at: '2026-05-20T11:55:00Z',
        },
      ],
    })
    expect(r.subject).toContain('1 new item')
  })
})
