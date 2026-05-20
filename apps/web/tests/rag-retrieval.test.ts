import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPrompt,
  rankByCosine,
  toCitations,
  type RetrievedChunk,
} from '../src/lib/rag'

describe('rankByCosine', () => {
  it('ranks identical vectors highest (cosine = 1)', () => {
    const q = [1, 0, 0]
    const candidates = [
      { embedding: [0, 1, 0] }, // orthogonal
      { embedding: [1, 0, 0] }, // identical
      { embedding: [0.5, 0.5, 0] }, // 45deg
    ]
    const ranked = rankByCosine(q, candidates, 3)
    expect(ranked[0]!.index).toBe(1)
    expect(ranked[0]!.similarity).toBeCloseTo(1, 5)
    expect(ranked[1]!.index).toBe(2)
    expect(ranked[2]!.index).toBe(0)
    expect(ranked[2]!.similarity).toBeCloseTo(0, 5)
  })

  it('respects k and trims the result', () => {
    const q = [1, 0]
    const candidates = [
      { embedding: [1, 0] },
      { embedding: [0.9, 0.1] },
      { embedding: [0.1, 0.9] },
      { embedding: [0, 1] },
    ]
    const ranked = rankByCosine(q, candidates, 2)
    expect(ranked).toHaveLength(2)
    expect(ranked[0]!.similarity).toBeGreaterThanOrEqual(ranked[1]!.similarity)
  })

  it('returns sorted similarities (descending)', () => {
    const q = [1, 2, 3]
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      embedding: [Math.sin(i), Math.cos(i), i / 10],
    }))
    const ranked = rankByCosine(q, candidates, 10)
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.similarity).toBeGreaterThanOrEqual(ranked[i]!.similarity)
    }
  })

  it('handles a zero query vector without dividing by zero', () => {
    const q = [0, 0, 0]
    const candidates = [{ embedding: [1, 2, 3] }]
    const ranked = rankByCosine(q, candidates, 1)
    expect(ranked[0]!.similarity).toBe(0)
  })
})

describe('buildPrompt', () => {
  it('groups retrieved chunks into a single context block in retrieval order', () => {
    const contexts: RetrievedChunk[] = [
      {
        id: 'a',
        document_id: 'd1',
        chunk_index: 4,
        page: 3,
        content: 'Rent is due on the 1st of each month.',
        similarity: 0.92,
      },
      {
        id: 'b',
        document_id: 'd1',
        chunk_index: 17,
        page: 12,
        content: 'Subletting requires written landlord consent.',
        similarity: 0.81,
      },
    ]
    const { contextBlock, questionBlock } = buildPrompt('When is rent due?', contexts)
    expect(contextBlock).toContain('Excerpt 5 | page 3')
    expect(contextBlock).toContain('Excerpt 18 | page 12')
    // Top match appears before the lower-ranked one.
    expect(contextBlock.indexOf('Excerpt 5')).toBeLessThan(contextBlock.indexOf('Excerpt 18'))
    expect(questionBlock).toContain('When is rent due?')
    expect(questionBlock).toContain('[page N]')
  })
})

describe('toCitations', () => {
  it('truncates long snippets with an ellipsis', () => {
    const long = 'x'.repeat(500)
    const cites = toCitations([
      {
        id: 'a',
        document_id: 'd',
        chunk_index: 0,
        page: 1,
        content: long,
        similarity: 0.5,
      },
    ])
    expect(cites).toHaveLength(1)
    expect(cites[0]!.snippet.length).toBeLessThanOrEqual(160)
    expect(cites[0]!.snippet.endsWith('…')).toBe(true)
    expect(cites[0]!.page).toBe(1)
    expect(cites[0]!.chunk_index).toBe(0)
  })

  it('keeps short snippets verbatim', () => {
    const cites = toCitations([
      {
        id: 'a',
        document_id: 'd',
        chunk_index: 2,
        page: 5,
        content: 'Short snippet.',
        similarity: 0.7,
      },
    ])
    expect(cites[0]!.snippet).toBe('Short snippet.')
  })
})

describe('answer (mocked Anthropic + OpenAI)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-anth'
    process.env.OPENAI_API_KEY = 'sk-test-openai'
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  it('returns Claude text plus citations from the retrieved contexts', async () => {
    // Mock the Anthropic SDK before re-importing rag.
    vi.doMock('@anthropic-ai/sdk', () => {
      class FakeAnthropic {
        messages = {
          create: vi.fn(async () => ({
            content: [{ type: 'text', text: 'Rent is due on the 1st [page 3].' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 10 },
          })),
        }
      }
      return { default: FakeAnthropic }
    })
    vi.doMock('openai', () => {
      class FakeOpenAI {
        embeddings = { create: vi.fn(async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] })) }
      }
      return { default: FakeOpenAI }
    })

    const { answer: answerFn } = await import('../src/lib/rag')
    const contexts: RetrievedChunk[] = [
      {
        id: 'a',
        document_id: 'd1',
        chunk_index: 4,
        page: 3,
        content: 'Rent is due on the 1st of each month. Late fee applies after the 5th.',
        similarity: 0.92,
      },
    ]
    const out = await answerFn('When is rent due?', contexts)
    expect(out.answer).toContain('[page 3]')
    expect(out.citations).toHaveLength(1)
    expect(out.citations[0]!.page).toBe(3)
  })
})

describe('answer fallback (no API key)', () => {
  it('throws a clear error when ANTHROPIC_API_KEY is unset', async () => {
    delete process.env.ANTHROPIC_API_KEY
    vi.resetModules()
    // Real Anthropic import is fine here — we just expect the factory to throw
    // before any network call happens.
    const { answer: answerFn } = await import('../src/lib/rag')
    await expect(answerFn('q', [])).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })
})
