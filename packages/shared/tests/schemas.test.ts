import { describe, expect, it } from 'vitest'
import { ShowingRequestInputSchema, MaintenanceRequestInputSchema } from '../src'

describe('ShowingRequestInputSchema', () => {
  const base = {
    building_id: '00000000-0000-0000-0000-000000000001',
    unit_id: null,
    slot_id: null,
    prospect_name: 'Jane Doe',
    prospect_email: 'jane@example.com',
    prospect_phone: null,
    preferred_dates: ['2026-06-01'],
    message: null,
    source: 'web' as const,
    turnstile_token: 'tk_xxx',
  }

  it('accepts minimal valid input with preferred dates', () => {
    expect(() => ShowingRequestInputSchema.parse(base)).not.toThrow()
  })

  it('rejects when neither slot nor preferred dates provided', () => {
    expect(() =>
      ShowingRequestInputSchema.parse({ ...base, preferred_dates: null })
    ).toThrow(/Either pick a slot/)
  })
})

describe('MaintenanceRequestInputSchema', () => {
  const base = {
    building_id: '00000000-0000-0000-0000-000000000001',
    unit_number: '3B',
    tenant_name: 'John Renter',
    tenant_email: 'j@example.com',
    tenant_phone: null,
    issue_type: 'plumbing' as const,
    urgency: 'normal' as const,
    description: 'Sink is leaking under the cabinet.',
    photo_paths: [],
    source: 'web' as const,
    turnstile_token: 'tk_xxx',
  }

  it('accepts minimal valid input', () => {
    expect(() => MaintenanceRequestInputSchema.parse(base)).not.toThrow()
  })

  it('rejects when both email and phone are null', () => {
    expect(() =>
      MaintenanceRequestInputSchema.parse({ ...base, tenant_email: null, tenant_phone: null })
    ).toThrow(/email or phone/)
  })

  it('rejects more than 5 photos', () => {
    expect(() =>
      MaintenanceRequestInputSchema.parse({ ...base, photo_paths: ['a','b','c','d','e','f'] })
    ).toThrow()
  })
})
