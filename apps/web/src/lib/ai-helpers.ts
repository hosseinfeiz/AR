// AI helpers backed by Claude (claude-sonnet-4-6).
//
// Three helpers:
//   1. generateListingCopy — produces three SEO listing-copy variants
//      (concise / feature-rich / lifestyle) for a unit. Applies prompt
//      caching to the unit + building context block so re-generation with
//      tweaks is cheap.
//   2. triageMaintenance — classifies a free-text maintenance description
//      into an issue_type + suggested urgency. Designed to be called from
//      the maintenance form on description blur, so it must be fast
//      (sub-1s p50).
//   3. noOpIfDisabled — small util that returns a fallback when
//      ANTHROPIC_API_KEY is unset (graceful degradation).
//
// Notes
// • S3 owns `apps/web/src/lib/anthropic.ts`. To avoid a merge conflict S10
//   does NOT create that file. Instead we lazily import the shared client
//   if it exists at runtime, and fall back to instantiating the SDK
//   inline. Once S3 merges, this file keeps working unchanged.
// • All public functions return `null` (or `[]`) when the AI feature is
//   disabled (no API key). Callers must handle that gracefully.

import type { APIContext } from 'astro'

// `@anthropic-ai/sdk` is a runtime dependency — the type-only import lets us
// keep this file typed even when S3's `lib/anthropic.ts` hasn't merged yet.
// We import it inside `getClient()` lazily so non-AI pages don't pay the cost.
type AnthropicClient = import('@anthropic-ai/sdk').default

export const AI_MODEL = 'claude-sonnet-4-6'

// ─── Runtime env / client ──────────────────────────────────────────────────

function envFor(locals: unknown): Record<string, string | undefined> {
  const runtimeEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } } | undefined)?.runtime?.env
  return runtimeEnv ?? (process.env as Record<string, string | undefined>)
}

export interface AiContext {
  apiKey: string | undefined
  log: (level: 'info' | 'warn' | 'error', msg: string, fields?: Record<string, unknown>) => void
}

/** Build an AiContext from an Astro APIContext. */
export function aiCtx(astroCtx: Pick<APIContext, 'locals'>): AiContext {
  const env = envFor(astroCtx.locals)
  return {
    apiKey: env.ANTHROPIC_API_KEY,
    log: (level, msg, fields) => {
      const line = `[ai-helpers] ${msg}`
      // eslint-disable-next-line no-console
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
      fn(line, fields ?? {})
    },
  }
}

let _cachedClient: AnthropicClient | null = null

async function getClient(apiKey: string): Promise<AnthropicClient> {
  if (_cachedClient) return _cachedClient
  // Note: when S3 lands, callers can switch to using the shared client at
  // `apps/web/src/lib/anthropic.ts`. We don't attempt a dynamic import of
  // that path here because Vite would attempt to resolve it at build
  // time. Instantiating inline is cheap (the SDK is just a thin wrapper)
  // and S3 can refactor this file as part of its merge.
  const mod = await import('@anthropic-ai/sdk')
  const Anthropic = mod.default
  _cachedClient = new Anthropic({ apiKey })
  return _cachedClient
}

/**
 * Returns a fallback when ANTHROPIC_API_KEY is unset. Logs a warning the
 * first time per cold start so operators notice the degraded state without
 * spamming logs.
 */
let _warnedMissing = false
export function noOpIfDisabled<T>(ctx: AiContext, fallback: T, label: string): T | null {
  if (ctx.apiKey) return null
  if (!_warnedMissing) {
    ctx.log('warn', `ANTHROPIC_API_KEY not set; ${label} disabled — returning fallback`)
    _warnedMissing = true
  }
  return fallback
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ListingUnitInput {
  unit_number: string
  bedrooms: number
  bathrooms: number
  sqft: number | null
  monthly_rent_cents: number
  available_from: string | null
  status: string
  description_md?: string
}

export interface ListingBuildingInput {
  name: string
  city: string
  state: string
  neighborhood_md?: string
  amenities: string[]
  pet_policy?: string | null
}

export interface ListingPhotoInput {
  alt_text?: string
  storage_path?: string
}

export type ListingVariantKind = 'concise' | 'feature-rich' | 'lifestyle'

export interface ListingVariant {
  kind: ListingVariantKind
  title: string
  body_md: string
}

export type IssueType = 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'pest' | 'locks' | 'other'
export type Urgency = 'low' | 'normal' | 'high' | 'emergency'

export interface TriageInput {
  description: string
  issue_type?: IssueType | null
  urgency?: Urgency | null
}

export interface TriageResult {
  /** AI-classified issue type. */
  suggested_issue_type: IssueType
  /** AI-suggested urgency. */
  suggested_urgency: Urgency
  /** Short, plain-language reasoning shown to the user (≤ 160 chars). */
  rationale: string
  /**
   * Whether the user's chosen urgency conflicts with the AI's suggestion
   * by more than one level (e.g. user picks "low" for an "emergency"
   * description). Null when the user hasn't set urgency yet.
   */
  urgency_conflict: boolean | null
  /** Same, but for issue_type. */
  issue_type_conflict: boolean | null
}

// ─── 1. Listing description writer ─────────────────────────────────────────

const LISTING_SYSTEM = `You are a senior rental-listing copywriter for a small,
owner-operated property-management company. You write tight, factual marketing
copy that highlights the most rentable features of a unit and its
neighborhood. Avoid superlatives ("luxurious", "stunning"), avoid fair-housing
red flags (no "perfect for [family/group]" language, no language about who the
unit is suited for), and avoid inventing features. Each variant must be
≤ 200 words. Output strictly valid JSON matching the requested schema.`.replace(/\n\s+/g, ' ')

const LISTING_VARIANT_GUIDE = `Produce THREE variants with these distinct voices:
1. "concise" — 60–90 words. Headline + 2 short paragraphs. Just the facts.
2. "feature-rich" — 140–180 words. Lead with the strongest 3 features, then
   list amenities, then a sentence about the building.
3. "lifestyle" — 140–180 words. Lead with a neighborhood/location hook, then
   weave in the unit's specs naturally. No clichés.

Return JSON: {"variants":[{"kind":"concise"|"feature-rich"|"lifestyle","title":"…","body_md":"…"}, …]}`

function fmtRent(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US')}/mo`
}

function buildUnitContext(args: {
  unit: ListingUnitInput
  building: ListingBuildingInput
  photos: ListingPhotoInput[]
}): string {
  const { unit, building, photos } = args
  const beds = unit.bedrooms === 0 ? 'Studio' : `${unit.bedrooms} bedroom`
  const sqft = unit.sqft ? `${unit.sqft} sqft` : 'sqft unspecified'
  const photoAlts = photos
    .map((p) => p.alt_text)
    .filter((s): s is string => Boolean(s && s.trim()))

  return [
    `BUILDING`,
    `  name: ${building.name}`,
    `  location: ${building.city}, ${building.state}`,
    `  neighborhood: ${building.neighborhood_md ?? '—'}`,
    `  amenities: ${building.amenities.join(', ') || '—'}`,
    `  pet_policy: ${building.pet_policy ?? '—'}`,
    ``,
    `UNIT`,
    `  unit_number: ${unit.unit_number}`,
    `  layout: ${beds} · ${unit.bathrooms} bath · ${sqft}`,
    `  rent: ${fmtRent(unit.monthly_rent_cents)}`,
    `  available_from: ${unit.available_from ?? '—'}`,
    `  status: ${unit.status}`,
    `  current_description: ${unit.description_md?.trim() || '—'}`,
    ``,
    `PHOTOS (alt text only — model cannot view images directly)`,
    photoAlts.length > 0 ? photoAlts.map((a, i) => `  ${i + 1}. ${a}`).join('\n') : '  (none)',
  ].join('\n')
}

function parseListingVariants(raw: string): ListingVariant[] {
  const trimmed = raw.trim()
  // Tolerate fenced code blocks just in case.
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const arr = (parsed as { variants?: unknown }).variants
  if (!Array.isArray(arr)) return []
  const out: ListingVariant[] = []
  for (const v of arr) {
    if (!v || typeof v !== 'object') continue
    const k = (v as { kind?: unknown }).kind
    const t = (v as { title?: unknown }).title
    const b = (v as { body_md?: unknown }).body_md
    if (
      (k === 'concise' || k === 'feature-rich' || k === 'lifestyle') &&
      typeof t === 'string' &&
      typeof b === 'string' &&
      t.length > 0 &&
      b.length > 0
    ) {
      out.push({ kind: k, title: t, body_md: b })
    }
  }
  return out
}

export async function generateListingCopy(
  ctx: AiContext,
  args: {
    unit: ListingUnitInput
    building: ListingBuildingInput
    photos: ListingPhotoInput[]
    /** Optional admin instructions to tweak generation (e.g. "emphasize the garage"). */
    notes?: string
  },
): Promise<ListingVariant[]> {
  const disabled = noOpIfDisabled<ListingVariant[]>(ctx, [], 'generateListingCopy')
  if (disabled !== null) return disabled

  const client = await getClient(ctx.apiKey!)
  const unitContext = buildUnitContext(args)
  const userTask = args.notes
    ? `${LISTING_VARIANT_GUIDE}\n\nAdmin notes (apply across all variants): ${args.notes.trim()}`
    : LISTING_VARIANT_GUIDE

  const started = Date.now()
  try {
    const resp = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      system: LISTING_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            // Stable unit + building context goes first, cached so that
            // re-generation with a tweaked `notes` value is cheap.
            { type: 'text', text: unitContext, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: userTask },
          ],
        },
      ],
    })

    const text = resp.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
    const variants = parseListingVariants(text)
    ctx.log('info', 'generateListingCopy ok', {
      ms: Date.now() - started,
      variants: variants.length,
      cache_read_tokens: resp.usage?.cache_read_input_tokens ?? 0,
      cache_creation_tokens: resp.usage?.cache_creation_input_tokens ?? 0,
    })
    return variants
  } catch (e) {
    ctx.log('error', 'generateListingCopy failed', {
      err: (e as Error).message,
      ms: Date.now() - started,
    })
    return []
  }
}

// ─── 2. Maintenance triage ────────────────────────────────────────────────

const TRIAGE_SYSTEM = `You are a property-management triage assistant. A tenant
just typed a free-text description of a maintenance problem. Your job:

1. Classify the issue_type into ONE of: plumbing, electrical, hvac, appliance,
   pest, locks, other.
2. Suggest an urgency: low | normal | high | emergency.
   • emergency: imminent risk to people, property, or habitability — e.g.
     active water leak, gas smell, no heat in winter, sewage backup, fire,
     anyone stuck.
   • high: significant disruption that cannot wait more than 24h — e.g. no
     hot water, fridge dead with food inside, broken lock on entry door.
   • normal: needs attention this week but tenant can manage — e.g. slow
     drain, leaky faucet, light fixture out.
   • low: cosmetic or convenience — e.g. scuffed paint, sticky door, single
     burner not working.
3. Give a one-sentence rationale (max 160 chars) tenants will see.

Be conservative: never downgrade to "low" when there is any uncertainty about
safety. Output STRICTLY valid JSON, nothing else.`.replace(/\n\s+/g, ' ')

const TRIAGE_SCHEMA_HINT =
  'Return: {"issue_type":"…","urgency":"…","rationale":"…"}'

const URGENCY_RANK: Record<Urgency, number> = {
  low: 0,
  normal: 1,
  high: 2,
  emergency: 3,
}

function parseTriage(raw: string): { issue_type: IssueType; urgency: Urgency; rationale: string } | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const issue = o.issue_type
  const urg = o.urgency
  const r = typeof o.rationale === 'string' ? o.rationale.slice(0, 200) : ''
  const validIssue: IssueType[] = ['plumbing', 'electrical', 'hvac', 'appliance', 'pest', 'locks', 'other']
  const validUrg: Urgency[] = ['low', 'normal', 'high', 'emergency']
  if (typeof issue !== 'string' || !validIssue.includes(issue as IssueType)) return null
  if (typeof urg !== 'string' || !validUrg.includes(urg as Urgency)) return null
  return { issue_type: issue as IssueType, urgency: urg as Urgency, rationale: r }
}

export async function triageMaintenance(
  ctx: AiContext,
  input: TriageInput,
): Promise<TriageResult | null> {
  // No fallback for the form-side hint: returning null tells the UI not to
  // show a banner. Treat empty/short inputs as a no-op too.
  if (!input.description || input.description.trim().length < 10) return null
  const disabled = noOpIfDisabled<TriageResult | null>(ctx, null, 'triageMaintenance')
  if (disabled !== null || !ctx.apiKey) {
    return disabled
  }

  const client = await getClient(ctx.apiKey)
  const started = Date.now()
  try {
    const resp = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 200,
      system: TRIAGE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${TRIAGE_SCHEMA_HINT}\n\nDescription:\n${input.description.trim().slice(0, 2000)}`,
        },
      ],
    })
    const text = resp.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
    const parsed = parseTriage(text)
    if (!parsed) {
      ctx.log('warn', 'triageMaintenance: model returned unparseable JSON', {
        ms: Date.now() - started,
        raw: text.slice(0, 200),
      })
      return null
    }
    const result: TriageResult = {
      suggested_issue_type: parsed.issue_type,
      suggested_urgency: parsed.urgency,
      rationale: parsed.rationale,
      urgency_conflict:
        input.urgency != null
          ? Math.abs(URGENCY_RANK[parsed.urgency] - URGENCY_RANK[input.urgency]) >= 2
          : null,
      issue_type_conflict:
        input.issue_type != null ? parsed.issue_type !== input.issue_type : null,
    }
    ctx.log('info', 'triageMaintenance ok', {
      ms: Date.now() - started,
      suggested_issue: parsed.issue_type,
      suggested_urgency: parsed.urgency,
    })
    return result
  } catch (e) {
    ctx.log('error', 'triageMaintenance failed', {
      err: (e as Error).message,
      ms: Date.now() - started,
    })
    return null
  }
}
