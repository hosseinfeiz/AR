import Anthropic from '@anthropic-ai/sdk'

// Production-grade Claude model as of 2026. The plan pins this version so the
// answer quality is reproducible across agents on the same prompt cache.
export const CLAUDE_MODEL = 'claude-sonnet-4-6'

let _client: Anthropic | null = null

/**
 * Returns a singleton Anthropic client. Throws a clear error when
 * `ANTHROPIC_API_KEY` is not set — the caller (the lease-qa API route) is
 * expected to surface that to the operator rather than crash the request.
 */
export function getAnthropicClient(): Anthropic {
  if (_client) return _client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      '[anthropic] ANTHROPIC_API_KEY is not set. Lease Q&A requires it. See docs/superpowers/runbooks/lease-rag.md.',
    )
  }
  _client = new Anthropic({ apiKey })
  return _client
}

/**
 * Build the system prompt for lease Q&A. Kept static so prompt-cache reads
 * actually hit; volatile context (the retrieved chunks for *this* question)
 * goes in the `messages` array, not the system prompt.
 */
export const LEASE_QA_SYSTEM_PROMPT = [
  'You are a careful assistant that answers tenant questions about their lease.',
  '',
  'Rules:',
  '- Answer ONLY from the lease excerpts provided in the user turn. If the lease does not address the question, say so explicitly — do not guess or invoke general legal knowledge.',
  '- Cite every factual claim by referencing the matching excerpt as [page N] (use the page number shown above each excerpt). Multiple citations are fine: [page 3] [page 12].',
  '- Be concise (2–5 sentences). Plain English. No legalese unless the lease itself uses it.',
  '- If the question is outside the lease (e.g. asking for legal advice, asking about other tenants), decline briefly.',
].join('\n')
