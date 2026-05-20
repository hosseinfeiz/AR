import OpenAI from 'openai'

// `text-embedding-3-large` natively returns 3072-dimensional vectors. We pass
// `dimensions: 1536` so the API truncates to 1536 dims, matching the
// `vector(1536)` column in `lease_chunks`. 1536 is the dimension cap for
// pgvector ivfflat indexes today.
export const EMBEDDING_MODEL = 'text-embedding-3-large'
export const EMBEDDING_DIMS = 1536

let _client: OpenAI | null = null

/**
 * Returns a singleton OpenAI client. We use OpenAI _only_ for embeddings —
 * Claude does not (as of 2026-05) expose a native embeddings endpoint, and
 * the RAG retrieval path needs deterministic embeddings on both ingestion
 * and query time.
 */
export function getOpenAIClient(): OpenAI {
  if (_client) return _client
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      '[embeddings] OPENAI_API_KEY is not set. Lease ingestion / Q&A retrieval requires it. See docs/superpowers/runbooks/lease-rag.md.',
    )
  }
  _client = new OpenAI({ apiKey })
  return _client
}

/**
 * Embed an array of strings. Batches automatically — OpenAI accepts up to
 * ~2048 inputs per call, but we cap the batch at 96 to keep latency
 * predictable and individual requests recoverable on transient failure.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const client = getOpenAIClient()
  const out: number[][] = []
  const BATCH = 96
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMS,
    })
    // Preserve order — OpenAI guarantees output index matches input index.
    for (const row of res.data) out.push(row.embedding)
  }
  return out
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text])
  if (!v) throw new Error('[embeddings] embedding API returned no vector')
  return v
}
