// ICS file generator for showing confirmations.
//
// We hand-roll RFC 5545 instead of pulling in the `ics` npm package because:
//   1. ICS is plaintext — generator is ~50 lines.
//   2. Cloudflare Workers bundle stays small (no node-only deps).
//
// Tested in apps/web/tests/ics.test.ts.

export interface IcsEvent {
  uid: string
  start: Date
  end: Date
  summary: string
  description?: string
  location?: string
  organizerEmail?: string
  organizerName?: string
  attendeeEmail?: string
  attendeeName?: string
  url?: string
  /** Override DTSTAMP (current time by default) — exposed for deterministic tests. */
  dtstamp?: Date
  method?: 'REQUEST' | 'PUBLISH' | 'CANCEL'
}

// Escape per RFC 5545 §3.3.11: backslashes, semicolons, commas, newlines.
export function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Format as UTC: YYYYMMDDTHHmmssZ.
export function toIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

// Fold long lines per RFC 5545 §3.1: lines > 75 octets must be folded.
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let i = 0
  while (i < line.length) {
    if (i === 0) {
      parts.push(line.slice(i, i + 75))
      i += 75
    } else {
      parts.push(' ' + line.slice(i, i + 74))
      i += 74
    }
  }
  return parts.join('\r\n')
}

export function buildIcs(ev: IcsEvent): string {
  const method = ev.method ?? 'REQUEST'
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//A & R Management//Showings//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${toIcsDate(ev.dtstamp ?? new Date())}`,
    `DTSTART:${toIcsDate(ev.start)}`,
    `DTEND:${toIcsDate(ev.end)}`,
    `SUMMARY:${escapeIcsText(ev.summary)}`,
  ]
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`)
  if (ev.location) lines.push(`LOCATION:${escapeIcsText(ev.location)}`)
  if (ev.url) lines.push(`URL:${ev.url}`)
  if (ev.organizerEmail) {
    const cn = ev.organizerName ? `;CN=${escapeIcsText(ev.organizerName)}` : ''
    lines.push(`ORGANIZER${cn}:mailto:${ev.organizerEmail}`)
  }
  if (ev.attendeeEmail) {
    const cn = ev.attendeeName ? `;CN=${escapeIcsText(ev.attendeeName)}` : ''
    lines.push(`ATTENDEE${cn};RSVP=TRUE:mailto:${ev.attendeeEmail}`)
  }
  lines.push('STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

// Produce a base64 payload suitable for use as a Resend attachment.
export function icsAttachment(filename: string, ev: IcsEvent): {
  filename: string
  content: string
  contentType: string
} {
  const ics = buildIcs(ev)
  // Use globalThis.btoa when available (Workers / browsers); fallback to Buffer (Node).
  // TextEncoder gives us a byte view safe for btoa (which only accepts Latin-1).
  let b64: string
  if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(ics)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
    b64 = btoa(bin)
  } else {
    b64 = Buffer.from(ics, 'utf-8').toString('base64')
  }
  return {
    filename,
    content: b64,
    contentType: 'text/calendar; method=REQUEST; charset=utf-8',
  }
}
