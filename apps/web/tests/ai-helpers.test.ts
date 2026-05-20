// Tests for lib/ai-helpers. The Anthropic SDK is mocked at the module
// boundary so tests run without any network or API key.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mock @anthropic-ai/sdk ────────────────────────────────────────────────
//
// vi.hoisted() runs before the mock factory, so the spy is in scope when
// ai-helpers does `import('@anthropic-ai/sdk')`.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = { create: createMock }
    constructor(_: unknown) {}
  }
  return { default: FakeAnthropic }
})

import {
  generateListingCopy,
  triageMaintenance,
  noOpIfDisabled,
  type AiContext,
} from '../src/lib/ai-helpers'

function ctxWithKey(): AiContext {
  return { apiKey: 'sk-test', log: vi.fn() }
}
function ctxNoKey(): AiContext {
  return { apiKey: undefined, log: vi.fn() }
}

const UNIT = {
  unit_number: '2A',
  bedrooms: 1,
  bathrooms: 1,
  sqft: 900,
  monthly_rent_cents: 99500,
  available_from: '2026-06-01',
  status: 'available',
  description_md: 'Bright corner one-bedroom.',
}
const BUILDING = {
  name: 'Grass Lake Manor Apartments',
  city: 'Richfield',
  state: 'MN',
  neighborhood_md: 'Quiet residential pocket.',
  amenities: ['Off-street parking', 'On-site laundry'],
  pet_policy: 'Cats only.',
}

beforeEach(() => {
  createMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('noOpIfDisabled', () => {
  it('returns null when API key is set (caller should proceed)', () => {
    const ctx = ctxWithKey()
    expect(noOpIfDisabled(ctx, 'fallback', 'feature')).toBeNull()
  })
  it('returns the fallback when API key is unset', () => {
    const ctx = ctxNoKey()
    expect(noOpIfDisabled(ctx, 'fallback-value', 'feature')).toBe('fallback-value')
  })
})

describe('generateListingCopy', () => {
  it('returns [] when ANTHROPIC_API_KEY is unset (graceful degradation)', async () => {
    const out = await generateListingCopy(ctxNoKey(), {
      unit: UNIT,
      building: BUILDING,
      photos: [],
    })
    expect(out).toEqual([])
    expect(createMock).not.toHaveBeenCalled()
  })

  it('parses three variants and applies cache_control on unit context', async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            variants: [
              { kind: 'concise', title: 'Bright one-bed', body_md: 'Short copy.' },
              { kind: 'feature-rich', title: 'Bright one-bed with parking', body_md: 'Longer copy.' },
              { kind: 'lifestyle', title: 'Lakeside living', body_md: 'Lifestyle copy.' },
            ],
          }),
        },
      ],
      usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    })

    const variants = await generateListingCopy(ctxWithKey(), {
      unit: UNIT,
      building: BUILDING,
      photos: [{ alt_text: 'Living room' }],
      notes: 'emphasize parking',
    })
    expect(variants).toHaveLength(3)
    expect(variants.map((v) => v.kind).sort()).toEqual(['concise', 'feature-rich', 'lifestyle'])

    // Verify cache_control was applied to the unit-context block.
    expect(createMock).toHaveBeenCalledTimes(1)
    const firstCall = createMock.mock.calls[0]
    if (!firstCall) throw new Error('expected createMock to have been called')
    const callArgs = firstCall[0] as {
      model: string
      messages: Array<{ content: Array<{ type: string; text: string; cache_control?: { type: string } }> }>
    }
    expect(callArgs.model).toBe('claude-sonnet-4-6')
    const message0 = callArgs.messages[0]
    if (!message0) throw new Error('expected at least one message')
    const content = message0.content
    const block0 = content[0]
    const block1 = content[1]
    if (!block0 || !block1) throw new Error('expected two content blocks')
    expect(block0.cache_control).toEqual({ type: 'ephemeral' })
    expect(block1.cache_control).toBeUndefined()
    // Admin notes are surfaced in the second block.
    expect(block1.text).toContain('emphasize parking')
  })

  it('returns [] when the model returns unparseable JSON', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
      usage: {},
    })
    const out = await generateListingCopy(ctxWithKey(), {
      unit: UNIT,
      building: BUILDING,
      photos: [],
    })
    expect(out).toEqual([])
  })

  it('returns [] on API error and logs', async () => {
    createMock.mockRejectedValue(new Error('rate limited'))
    const ctx = ctxWithKey()
    const out = await generateListingCopy(ctx, { unit: UNIT, building: BUILDING, photos: [] })
    expect(out).toEqual([])
    expect(ctx.log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('generateListingCopy failed'),
      expect.objectContaining({ err: 'rate limited' }),
    )
  })

  it('tolerates fenced JSON code blocks in the response', async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n' + JSON.stringify({
            variants: [
              { kind: 'concise', title: 'A', body_md: 'B' },
            ],
          }) + '\n```',
        },
      ],
      usage: {},
    })
    const out = await generateListingCopy(ctxWithKey(), { unit: UNIT, building: BUILDING, photos: [] })
    expect(out).toHaveLength(1)
    expect(out[0]?.kind).toBe('concise')
  })
})

describe('triageMaintenance', () => {
  it('returns null when description is too short', async () => {
    const out = await triageMaintenance(ctxWithKey(), { description: 'leak' })
    expect(out).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('returns null when ANTHROPIC_API_KEY is unset', async () => {
    const out = await triageMaintenance(ctxNoKey(), {
      description: 'water leaking under the kitchen sink for two days',
    })
    expect(out).toBeNull()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('parses model response and detects urgency conflict', async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            issue_type: 'plumbing',
            urgency: 'emergency',
            rationale: 'Active leak — risk of water damage.',
          }),
        },
      ],
      usage: {},
    })
    const result = await triageMaintenance(ctxWithKey(), {
      description: 'water is gushing out of the kitchen sink and flooding the floor',
      issue_type: 'plumbing',
      urgency: 'low',
    })
    expect(result).not.toBeNull()
    expect(result!.suggested_issue_type).toBe('plumbing')
    expect(result!.suggested_urgency).toBe('emergency')
    expect(result!.urgency_conflict).toBe(true)
    expect(result!.issue_type_conflict).toBe(false)
  })

  it('does not flag conflict when user has not selected urgency yet', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'text', text: JSON.stringify({ issue_type: 'hvac', urgency: 'normal', rationale: 'AC slow' }) },
      ],
      usage: {},
    })
    const result = await triageMaintenance(ctxWithKey(), {
      description: 'The air conditioner is cooling slowly in the living room.',
    })
    expect(result!.urgency_conflict).toBeNull()
    expect(result!.issue_type_conflict).toBeNull()
  })

  it('returns null on unparseable model output', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'not json' }],
      usage: {},
    })
    const out = await triageMaintenance(ctxWithKey(), {
      description: 'The refrigerator stopped working overnight and food is warm.',
    })
    expect(out).toBeNull()
  })

  it('returns null on invalid issue_type from model', async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ issue_type: 'wizardry', urgency: 'low', rationale: 'magic' }),
        },
      ],
      usage: {},
    })
    const out = await triageMaintenance(ctxWithKey(), {
      description: 'Something strange is happening with the lights when I clap.',
    })
    expect(out).toBeNull()
  })

  it('only treats urgency differences of 2+ levels as a conflict', async () => {
    createMock.mockResolvedValue({
      content: [
        { type: 'text', text: JSON.stringify({ issue_type: 'plumbing', urgency: 'high', rationale: 'x' }) },
      ],
      usage: {},
    })
    const out = await triageMaintenance(ctxWithKey(), {
      description: 'Sink is draining slowly, needs a snake soon.',
      issue_type: 'plumbing',
      urgency: 'normal', // 1 level off — not a conflict
    })
    expect(out!.urgency_conflict).toBe(false)
  })
})
