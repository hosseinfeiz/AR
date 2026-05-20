import { CLAUDE_MODEL, LEASE_QA_SYSTEM_PROMPT, getAnthropicClient } from './anthropic'
import { embedQuery, embedTexts } from './embeddings'
import { getAdminClient } from './supabase-admin'

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

export interface ChunkOptions {
  /** Target chunk size in characters. Roughly ~250 tokens for English prose. */
  size?: number
  /** Overlap in characters between adjacent chunks. Keeps cross-boundary
   *  context (rent due date split across paragraphs) retrievable. */
  overlap?: number
}

export interface Chunk {
  index: number
  page: number | null
  content: string
  tokens: number
}

/**
 * Per-page input — produced by `pdf-parse` (or test fixtures). We chunk each
 * page independently so we can track the page number for citations.
 */
export interface PageInput {
  page: number
  text: string
}

/**
 * Naive whitespace-aware chunker. Splits a single page into ~1000-char chunks
 * with 150-char overlap. Splits on paragraph (\n\n) boundaries when possible,
 * falling back to word boundaries; never mid-word.
 */
export function chunk(pages: PageInput[], opts: ChunkOptions = {}): Chunk[] {
  const size = opts.size ?? 1000
  const overlap = opts.overlap ?? 150
  if (overlap >= size) {
    throw new Error('[rag.chunk] overlap must be smaller than size')
  }

  const chunks: Chunk[] = []
  let globalIndex = 0

  for (const { page, text } of pages) {
    const cleaned = text.replace(/\r\n/g, '\n').trim()
    if (!cleaned) continue

    // Greedy fill: build a paragraph buffer until size, emit, then keep an
    // overlap tail for the next chunk.
    const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

    // Stream-flush approach. Maintain `buffer`; each `flush()` emits its
    // contents (word-splitting if too large) and seeds the buffer with an
    // overlap tail. We then concatenate further paragraphs into buffer; if
    // an individual paragraph alone exceeds size we hand it to flush() too.
    let buffer = ''

    const pushContent = (content: string) => {
      const trimmed = content.trim()
      if (!trimmed) return
      chunks.push({
        index: globalIndex++,
        page,
        content: trimmed,
        // ~4 chars per token for English — cost-tracking heuristic, not billing.
        tokens: Math.max(1, Math.round(trimmed.length / 4)),
      })
    }
    const tailOverlap = (content: string): string => {
      if (overlap <= 0 || content.length <= overlap) return ''
      const tail = content.slice(content.length - overlap)
      const firstSpace = tail.indexOf(' ')
      return firstSpace >= 0 ? tail.slice(firstSpace + 1) : ''
    }
    const flush = () => {
      const trimmed = buffer.trim()
      if (!trimmed) {
        buffer = ''
        return
      }
      if (trimmed.length <= size) {
        pushContent(trimmed)
        buffer = tailOverlap(trimmed)
        return
      }
      // Buffer larger than size — word-split.
      const words = trimmed.split(/\s+/).filter(Boolean)
      let sub = ''
      for (const w of words) {
        if (!sub) {
          sub = w
        } else if (sub.length + 1 + w.length <= size) {
          sub += ' ' + w
        } else {
          pushContent(sub)
          const carry = tailOverlap(sub)
          sub = carry ? carry + ' ' + w : w
        }
      }
      if (sub) {
        pushContent(sub)
        buffer = tailOverlap(sub)
      } else {
        buffer = ''
      }
    }

    for (const p of paragraphs) {
      if (!buffer) {
        buffer = p
      } else if (buffer.length + 2 + p.length <= size) {
        buffer += '\n\n' + p
      } else {
        flush()
        buffer = buffer ? buffer + '\n\n' + p : p
      }
      // If buffer became larger than size (paragraph too big on its own),
      // flush immediately to keep size bounded.
      if (buffer.length > size) flush()
    }
    flush()
  }

  return chunks
}

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

export interface EmbeddedChunk extends Chunk {
  embedding: number[]
}

export async function embed(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) return []
  const vectors = await embedTexts(chunks.map((c) => c.content))
  return chunks.map((c, i) => {
    const v = vectors[i]
    if (!v) throw new Error(`[rag.embed] missing vector for chunk ${i}`)
    return { ...c, embedding: v }
  })
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export interface RetrievedChunk {
  id: string
  document_id: string
  chunk_index: number
  page: number | null
  content: string
  similarity: number
}

export async function retrieve(
  question: string,
  leaseId: string,
  k = 6,
): Promise<RetrievedChunk[]> {
  const vector = await embedQuery(question)
  const supabase = getAdminClient()
  const { data, error } = await supabase.rpc('match_lease_chunks', {
    p_lease_id: leaseId,
    p_query_embed: vector as unknown as string, // pgvector accepts JSON arrays over PostgREST
    p_match_count: k,
  })
  if (error) throw new Error(`[rag.retrieve] supabase rpc failed: ${error.message}`)
  type Row = {
    id: string
    document_id: string
    chunk_index: number
    page_number: number | null
    content: string
    similarity: number
  }
  const rows = (data ?? []) as Row[]
  return rows.map((r) => ({
    id: r.id,
    document_id: r.document_id,
    chunk_index: r.chunk_index,
    page: r.page_number,
    content: r.content,
    similarity: r.similarity,
  }))
}

/**
 * In-memory cosine retrieval — used by the unit tests (and as a fallback in
 * environments without Supabase). Pure function, no I/O.
 */
export function rankByCosine(
  query: number[],
  candidates: { embedding: number[] }[],
  k: number,
): { index: number; similarity: number }[] {
  const qn = norm(query)
  const scored = candidates.map((c, index) => {
    const cn = norm(c.embedding)
    const denom = qn * cn
    const similarity = denom === 0 ? 0 : dot(query, c.embedding) / denom
    return { index, similarity }
  })
  scored.sort((a, b) => b.similarity - a.similarity)
  return scored.slice(0, k)
}

function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let s = 0
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0)
  return s
}
function norm(a: number[]): number {
  let s = 0
  for (const v of a) s += v * v
  return Math.sqrt(s)
}

// ---------------------------------------------------------------------------
// Answer generation
// ---------------------------------------------------------------------------

export interface Citation {
  page: number | null
  chunk_index: number
  snippet: string
}

export interface AnswerResult {
  answer: string
  citations: Citation[]
}

/**
 * Build the user-turn content for Claude. The lease excerpts go in their own
 * text block with `cache_control: ephemeral` so follow-up questions about the
 * same lease (within ~5 minutes) only pay ~0.1× for the context tokens.
 *
 * The *question* sits in a second, uncached block so each question is its
 * own cache miss tail, not a cache invalidator on the context block.
 */
export function buildPrompt(question: string, contexts: RetrievedChunk[]): {
  contextBlock: string
  questionBlock: string
} {
  const contextBlock =
    'Lease excerpts (most relevant first):\n\n' +
    contexts
      .map((c) => `--- Excerpt ${c.chunk_index + 1} | page ${c.page ?? '?'} ---\n${c.content.trim()}`)
      .join('\n\n')
  const questionBlock = `Tenant question:\n${question.trim()}\n\nAnswer using the excerpts above. Cite pages as [page N].`
  return { contextBlock, questionBlock }
}

export async function answer(
  question: string,
  contexts: RetrievedChunk[],
): Promise<AnswerResult> {
  const client = getAnthropicClient()
  const { contextBlock, questionBlock } = buildPrompt(question, contexts)

  // Non-streaming generation — used by the test harness and as a fallback
  // for routes that can't stream. The portal route uses `streamAnswer` below
  // for token-by-token UX.
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: LEASE_QA_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: contextBlock, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: questionBlock },
        ],
      },
    ],
  })

  const text = response.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter((s) => s.length > 0)
    .join('\n')
    .trim()

  return { answer: text, citations: toCitations(contexts) }
}

export function toCitations(contexts: RetrievedChunk[]): Citation[] {
  return contexts.map((c) => ({
    page: c.page,
    chunk_index: c.chunk_index,
    snippet: c.content.length > 160 ? c.content.slice(0, 157).trimEnd() + '…' : c.content,
  }))
}

/**
 * Streaming variant — returns the raw Anthropic message stream so the caller
 * can pipe deltas to the client. Cache breakpoint is on the context block.
 */
export function streamAnswer(question: string, contexts: RetrievedChunk[]) {
  const client = getAnthropicClient()
  const { contextBlock, questionBlock } = buildPrompt(question, contexts)
  return client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: LEASE_QA_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: contextBlock, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: questionBlock },
        ],
      },
    ],
  })
}
