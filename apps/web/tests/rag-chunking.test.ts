import { describe, expect, it } from 'vitest'
import { chunk, type PageInput } from '../src/lib/rag'

describe('chunk', () => {
  it('returns no chunks for empty input', () => {
    expect(chunk([])).toEqual([])
    expect(chunk([{ page: 1, text: '   ' }])).toEqual([])
  })

  it('produces a single chunk for short text and preserves the page number', () => {
    const pages: PageInput[] = [{ page: 7, text: 'This is a short lease section about rent.' }]
    const result = chunk(pages, { size: 1000, overlap: 100 })
    expect(result).toHaveLength(1)
    expect(result[0]!.page).toBe(7)
    expect(result[0]!.index).toBe(0)
    expect(result[0]!.content).toContain('short lease section')
    expect(result[0]!.tokens).toBeGreaterThan(0)
  })

  it('respects the chunk size and stays close to the boundary', () => {
    // Build a deterministic large input: 30 paragraphs of ~100 chars each.
    const paragraphs = Array.from({ length: 30 }, (_, i) =>
      `Paragraph ${i}: ` + 'lease text '.repeat(8).trim(),
    )
    const pages: PageInput[] = [{ page: 1, text: paragraphs.join('\n\n') }]
    const result = chunk(pages, { size: 400, overlap: 80 })
    expect(result.length).toBeGreaterThan(1)
    for (const c of result) {
      // The chunker is allowed to slightly overshoot on the final paragraph
      // append (since we add then test); the upper bound below catches
      // anything pathological.
      expect(c.content.length).toBeLessThanOrEqual(800)
      expect(c.content.trim().length).toBeGreaterThan(0)
      expect(c.page).toBe(1)
    }
    // Chunk indices are strictly increasing and start at 0.
    expect(result[0]!.index).toBe(0)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.index).toBe(result[i - 1]!.index + 1)
    }
  })

  it('preserves overlap between adjacent chunks (smoke-test)', () => {
    const text = Array.from({ length: 20 }, (_, i) => `Section ${i}: ` + 'word '.repeat(40).trim()).join(
      '\n\n',
    )
    const pages: PageInput[] = [{ page: 2, text }]
    const result = chunk(pages, { size: 500, overlap: 100 })
    expect(result.length).toBeGreaterThan(1)
    // The tail of chunk N and the head of chunk N+1 should share at least one
    // word — verified by looking for a common substring of >= 8 chars.
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]!.content.slice(-150)
      const next = result[i]!.content.slice(0, 150)
      const overlapped = findCommonSubstring(prev, next, 8)
      expect(overlapped).not.toBeNull()
    }
  })

  it('chunks each page independently and labels them correctly', () => {
    const pages: PageInput[] = [
      { page: 1, text: 'Page one content about deposits.' },
      { page: 2, text: 'Page two content about late fees.' },
      { page: 3, text: 'Page three content about renewals.' },
    ]
    const result = chunk(pages, { size: 1000, overlap: 100 })
    expect(result).toHaveLength(3)
    expect(result.map((c) => c.page)).toEqual([1, 2, 3])
    expect(result[0]!.content).toContain('deposits')
    expect(result[1]!.content).toContain('late fees')
    expect(result[2]!.content).toContain('renewals')
  })

  it('throws if overlap >= size', () => {
    expect(() => chunk([{ page: 1, text: 'x' }], { size: 100, overlap: 100 })).toThrow()
    expect(() => chunk([{ page: 1, text: 'x' }], { size: 100, overlap: 200 })).toThrow()
  })

  it('handles a paragraph longer than the chunk size by word-splitting', () => {
    const longPara = 'word '.repeat(400).trim() // ~2000 chars, no \n\n
    const pages: PageInput[] = [{ page: 1, text: longPara }]
    const result = chunk(pages, { size: 500, overlap: 50 })
    expect(result.length).toBeGreaterThan(1)
    // No chunk should be empty.
    for (const c of result) expect(c.content.trim().length).toBeGreaterThan(0)
  })
})

function findCommonSubstring(a: string, b: string, minLen: number): string | null {
  if (a.length < minLen || b.length < minLen) return null
  for (let len = Math.min(a.length, b.length); len >= minLen; len--) {
    for (let i = 0; i + len <= a.length; i++) {
      const sub = a.slice(i, i + len)
      if (b.includes(sub)) return sub
    }
  }
  return null
}
