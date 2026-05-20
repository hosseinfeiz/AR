// E-signature — Dropbox Sign client + mock fallback.
//
// Live mode is enabled when DROPBOX_SIGN_API_KEY is set. Otherwise we return a
// fake envelope id and a preview URL pointing at the internal lease preview
// route so the pipeline works end-to-end in dev / tests.
//
// We model only what the applicant pipeline needs:
//   sendForSignature(args)   → { envelope_id, signing_url, mock }
//   verifyWebhook(headers, body, env)? → boolean   (best-effort verification)

export interface SendForSignatureArgs {
  applicant_id: string
  applicant_name: string
  applicant_email: string
  /** Lease PDF bytes — the document the signer sees. */
  pdf: Uint8Array
  /** Subject for the signing request email. */
  subject?: string
  /** Free-text message shown to signer. */
  message?: string
}

export interface SendForSignatureResult {
  envelope_id: string
  signing_url: string
  mock: boolean
  raw?: unknown
}

const DROPBOX_SIGN_ENDPOINT = 'https://api.hellosign.com/v3/signature_request/send'

/** Mock envelope — opaque id + internal preview URL. */
export function mockEnvelope(args: { applicant_id: string }): SendForSignatureResult {
  const stamp = Date.now().toString(36)
  const rand = Math.floor(Math.random() * 0xffffff).toString(36).padStart(4, '0')
  return {
    envelope_id: `mock-envelope-${args.applicant_id.slice(0, 12)}-${stamp}-${rand}`,
    signing_url: `/admin/applicants/${args.applicant_id}/lease/preview`,
    mock: true,
  }
}

export async function sendForSignature(
  args: SendForSignatureArgs,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): Promise<SendForSignatureResult> {
  const apiKey = env.DROPBOX_SIGN_API_KEY
  if (!apiKey) return mockEnvelope({ applicant_id: args.applicant_id })

  try {
    // Dropbox Sign uses multipart/form-data with basic-auth (apiKey:).
    const form = new FormData()
    form.append('title', args.subject ?? 'Lease agreement')
    form.append('subject', args.subject ?? 'Lease agreement')
    if (args.message) form.append('message', args.message)
    form.append('signers[0][email_address]', args.applicant_email)
    form.append('signers[0][name]', args.applicant_name)
    form.append('signers[0][order]', '0')
    if (env.DROPBOX_SIGN_TEAM_ID) form.append('team_id', env.DROPBOX_SIGN_TEAM_ID)
    form.append('test_mode', '1')
    const blob = new Blob([args.pdf as unknown as ArrayBuffer], { type: 'application/pdf' })
    form.append('file[0]', blob, 'lease.pdf')

    const auth = typeof btoa === 'function'
      ? btoa(`${apiKey}:`)
      : Buffer.from(`${apiKey}:`).toString('base64')

    const res = await fetchImpl(DROPBOX_SIGN_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
      body: form,
    })

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[esign] Dropbox Sign ${res.status}; falling back to mock`)
      return mockEnvelope({ applicant_id: args.applicant_id })
    }

    const raw = (await res.json()) as {
      signature_request?: {
        signature_request_id?: string
        signing_url?: string
      }
    }

    const id = raw.signature_request?.signature_request_id
    const url = raw.signature_request?.signing_url
    if (!id) {
      // eslint-disable-next-line no-console
      console.warn('[esign] Dropbox Sign returned no signature_request_id; falling back to mock')
      return mockEnvelope({ applicant_id: args.applicant_id })
    }
    return {
      envelope_id: id,
      signing_url: url ?? `https://app.hellosign.com/sign/${id}`,
      mock: false,
      raw,
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[esign] Dropbox Sign call failed; using mock. Reason: ${(e as Error).message}`)
    return mockEnvelope({ applicant_id: args.applicant_id })
  }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface WebhookEvent {
  event_type: 'signature_request_signed' | 'signature_request_all_signed' | 'signature_request_declined' | string
  envelope_id: string
  signed_pdf_url?: string
  // The applicant id we passed in `metadata` when creating the envelope.
  applicant_id?: string
}

/**
 * Parse the body of an inbound e-sign webhook.
 * Returns a normalized event the API route can act on.
 *
 * Dropbox Sign sends `application/x-www-form-urlencoded` with a single `json`
 * field that contains the actual payload. We accept either (a) that shape, or
 * (b) a flat JSON event we generate from our own UI in mock-mode tests.
 */
export function parseWebhookEvent(payload: unknown): WebhookEvent | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>

  // Dropbox Sign-style: { event: { event_type }, signature_request: { signature_request_id, files_url, metadata } }
  if ('event' in obj || 'signature_request' in obj) {
    const event = (obj.event ?? {}) as Record<string, unknown>
    const sr = (obj.signature_request ?? {}) as Record<string, unknown>
    const metadata = (sr.metadata ?? {}) as Record<string, unknown>
    const id = typeof sr.signature_request_id === 'string' ? sr.signature_request_id : undefined
    if (!id) return null
    return {
      event_type: typeof event.event_type === 'string' ? event.event_type : 'signature_request_signed',
      envelope_id: id,
      signed_pdf_url: typeof sr.files_url === 'string' ? sr.files_url : undefined,
      applicant_id: typeof metadata.applicant_id === 'string' ? metadata.applicant_id : undefined,
    }
  }

  // Flat shape (our mock-mode webhook trigger)
  const envelope_id = typeof obj.envelope_id === 'string' ? obj.envelope_id : undefined
  if (!envelope_id) return null
  return {
    event_type: typeof obj.event_type === 'string' ? obj.event_type : 'signature_request_all_signed',
    envelope_id,
    signed_pdf_url: typeof obj.signed_pdf_url === 'string' ? obj.signed_pdf_url : undefined,
    applicant_id: typeof obj.applicant_id === 'string' ? obj.applicant_id : undefined,
  }
}
