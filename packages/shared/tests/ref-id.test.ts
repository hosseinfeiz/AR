import { describe, expect, it } from 'vitest'
import { generateRefId } from '../src/ref-id'

describe('generateRefId', () => {
  it('returns an 8-char uppercase alphanumeric id', () => {
    const id = generateRefId()
    expect(id).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('does not include ambiguous chars (0, O, 1, I, L)', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateRefId()
      expect(id).not.toMatch(/[0O1IL]/)
    }
  })

  it('returns different ids on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRefId()))
    expect(ids.size).toBeGreaterThan(95)
  })
})
