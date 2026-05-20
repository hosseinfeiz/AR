import { describe, expect, it } from 'vitest'
import { renderLeasePdf } from '../../src/lib/lease-pdf'

describe('renderLeasePdf', () => {
  it('produces a real PDF byte stream', async () => {
    const bytes = await renderLeasePdf({
      applicant_name: 'Olivia Park',
      applicant_email: 'olivia.park@demo.test',
      building_name: 'Grass Lake Manor Apartments',
      building_address: '928 Rae Drive, Richfield, MN 55423',
      unit_label: 'Grass Lake Manor #2A',
      monthly_rent_cents: 109500,
      security_deposit_cents: 109500,
      lease_start: '2026-06-15',
      lease_end: '2027-06-14',
      generated_at: '2026-05-20T00:00:00Z',
    })

    expect(bytes).toBeInstanceOf(Uint8Array)
    // PDF magic: "%PDF-"
    expect(bytes.length).toBeGreaterThan(500)
    const head = String.fromCharCode(...bytes.slice(0, 5))
    expect(head).toBe('%PDF-')
    // Should also end with EOF marker
    const tail = String.fromCharCode(...bytes.slice(-6))
    expect(tail).toContain('%%EOF')
  })

  it('handles zero rent and missing-y date gracefully', async () => {
    const bytes = await renderLeasePdf({
      applicant_name: 'Zero Rent',
      applicant_email: 'z@x.test',
      building_name: 'Test Building',
      building_address: 'Nowhere, MN 55400',
      unit_label: 'Test #TBD',
      monthly_rent_cents: 0,
      security_deposit_cents: 0,
      lease_start: '2026-06-01',
      lease_end: '2027-05-31',
    })
    expect(bytes.length).toBeGreaterThan(500)
  })
})
