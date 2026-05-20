// Lease PDF renderer.
//
// Renders a simple, single-page A & R Management lease agreement using pdf-lib.
// The output is a real, parseable PDF — Dropbox Sign accepts it directly.
//
// Keep this template intentionally minimal: it's a legal placeholder for the
// applicant pipeline. A real production template would be co-authored with
// counsel and rendered from a versioned source (e.g. a DOCX template + headless
// LibreOffice, or a dedicated PDF form). For the pipeline mechanics we only
// need a PDF that lists the parties + key terms.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export interface LeasePdfInput {
  applicant_name: string
  applicant_email: string
  building_name: string
  building_address: string
  unit_label: string
  monthly_rent_cents: number
  security_deposit_cents: number
  lease_start: string  // 'YYYY-MM-DD'
  lease_end: string    // 'YYYY-MM-DD'
  /** Optional override (e.g. for tests / deterministic output). Defaults to "now()". */
  generated_at?: string
}

function fmtMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtDate(iso: string): string {
  // Accept either YYYY-MM-DD or full ISO timestamps
  const d = iso.length === 10 ? new Date(iso + 'T00:00:00Z') : new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export async function renderLeasePdf(input: LeasePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792]) // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const M = 54 // 0.75" margin
  let y = 792 - M

  const line = (
    text: string,
    opts: { size?: number; bold?: boolean; gap?: number; color?: [number, number, number] } = {},
  ) => {
    const size = opts.size ?? 11
    const f = opts.bold ? bold : font
    const color = opts.color ? rgb(opts.color[0], opts.color[1], opts.color[2]) : rgb(0.1, 0.1, 0.12)
    page.drawText(text, { x: M, y, size, font: f, color })
    y -= size + (opts.gap ?? 4)
  }

  // Header
  line('A & R MANAGEMENT — RESIDENTIAL LEASE AGREEMENT', { size: 16, bold: true, gap: 12 })
  line(`Generated ${fmtDate(input.generated_at ?? new Date().toISOString())}`, { size: 9, color: [0.4, 0.4, 0.45], gap: 18 })

  // Parties
  line('PARTIES', { size: 12, bold: true, gap: 8 })
  line(`Landlord: A & R Management Co.`)
  line(`Tenant:   ${input.applicant_name}  <${input.applicant_email}>`, { gap: 14 })

  // Premises
  line('PREMISES', { size: 12, bold: true, gap: 8 })
  line(`Building: ${input.building_name}`)
  line(`Address:  ${input.building_address}`)
  line(`Unit:     ${input.unit_label}`, { gap: 14 })

  // Term
  line('TERM', { size: 12, bold: true, gap: 8 })
  line(`Lease start: ${fmtDate(input.lease_start)}`)
  line(`Lease end:   ${fmtDate(input.lease_end)}`, { gap: 14 })

  // Rent
  line('RENT AND DEPOSIT', { size: 12, bold: true, gap: 8 })
  line(`Monthly rent:     ${fmtMoney(input.monthly_rent_cents)}`)
  line(`Security deposit: ${fmtMoney(input.security_deposit_cents)}`, { gap: 14 })

  // Covenants — short summary
  line('COVENANTS', { size: 12, bold: true, gap: 8 })
  line('1. Tenant shall pay rent on or before the 1st of each month.')
  line('2. Tenant shall keep the unit in good condition and report damage promptly.')
  line('3. Landlord shall maintain common areas and major appliances.')
  line('4. This agreement is governed by the laws of the State of Minnesota.', { gap: 18 })

  // Signature blocks
  line('SIGNATURES', { size: 12, bold: true, gap: 16 })

  // Draw signature lines
  const drawSigLine = (label: string) => {
    const lineY = y + 2
    page.drawLine({
      start: { x: M, y: lineY },
      end: { x: M + 320, y: lineY },
      thickness: 0.5,
      color: rgb(0.3, 0.3, 0.35),
    })
    y -= 4
    page.drawText(label, { x: M, y, size: 9, font, color: rgb(0.4, 0.4, 0.45) })
    y -= 30
  }
  drawSigLine(`Tenant — ${input.applicant_name}`)
  drawSigLine('Landlord — A & R Management Co.')

  const bytes = await doc.save()
  return bytes
}
