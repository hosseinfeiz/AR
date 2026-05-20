import { describe, expect, it } from 'vitest'
import { buildIcs, escapeIcsText, icsAttachment, toIcsDate } from '../src/lib/ics'

describe('toIcsDate', () => {
  it('formats a Date as UTC YYYYMMDDTHHmmssZ', () => {
    expect(toIcsDate(new Date('2026-05-20T17:30:00Z'))).toBe('20260520T173000Z')
  })
  it('zero-pads single-digit components', () => {
    expect(toIcsDate(new Date('2026-01-02T03:04:05Z'))).toBe('20260102T030405Z')
  })
})

describe('escapeIcsText', () => {
  it('escapes special chars per RFC 5545', () => {
    expect(escapeIcsText('hello, world; new\nline\\path'))
      .toBe('hello\\, world\\; new\\nline\\\\path')
  })
})

describe('buildIcs', () => {
  const ev = {
    uid: 'abc-123@armgmt.co',
    start: new Date('2026-06-01T15:00:00Z'),
    end: new Date('2026-06-01T15:30:00Z'),
    summary: 'Showing — Grass Lake Manor',
    description: 'Showing for Pat Tester',
    location: '928 Rae Drive, Richfield, MN',
    organizerEmail: 'manager@armgmt.co',
    attendeeEmail: 'pat@example.com',
    attendeeName: 'Pat Tester',
    dtstamp: new Date('2026-05-20T12:00:00Z'),
  }

  it('produces a well-formed VCALENDAR/VEVENT block', () => {
    const ics = buildIcs(ev)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('METHOD:REQUEST')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('UID:abc-123@armgmt.co')
    expect(ics).toContain('DTSTART:20260601T150000Z')
    expect(ics).toContain('DTEND:20260601T153000Z')
    expect(ics).toContain('DTSTAMP:20260520T120000Z')
    expect(ics).toContain('SUMMARY:Showing — Grass Lake Manor')
    expect(ics).toContain('ORGANIZER:mailto:manager@armgmt.co')
    expect(ics).toContain('ATTENDEE;CN=Pat Tester;RSVP=TRUE:mailto:pat@example.com')
    expect(ics).toContain('END:VEVENT')
    expect(ics).toContain('END:VCALENDAR')
  })

  it('uses CRLF line endings (RFC 5545 §3.1)', () => {
    const ics = buildIcs(ev)
    expect(ics.split('\r\n').length).toBeGreaterThan(8)
    // The final line must end with CRLF.
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('omits optional fields when not provided', () => {
    const ics = buildIcs({
      uid: 'x', start: new Date('2026-06-01T15:00:00Z'), end: new Date('2026-06-01T15:30:00Z'),
      summary: 'S', dtstamp: new Date('2026-05-20T00:00:00Z'),
    })
    expect(ics).not.toContain('LOCATION')
    expect(ics).not.toContain('DESCRIPTION')
    expect(ics).not.toContain('ATTENDEE')
  })
})

describe('icsAttachment', () => {
  it('returns base64-encoded content + calendar mime type', () => {
    const a = icsAttachment('showing-X.ics', {
      uid: 'x', start: new Date('2026-06-01T15:00:00Z'), end: new Date('2026-06-01T15:30:00Z'),
      summary: 'S', dtstamp: new Date('2026-05-20T00:00:00Z'),
    })
    expect(a.filename).toBe('showing-X.ics')
    expect(a.contentType).toContain('text/calendar')
    const decoded = Buffer.from(a.content, 'base64').toString('utf-8')
    expect(decoded).toContain('BEGIN:VCALENDAR')
  })
})
