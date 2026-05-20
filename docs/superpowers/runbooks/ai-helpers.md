# AI helpers runbook (S10)

Operator-facing notes for the three Claude-backed helpers added in S10:

1. **Listing description writer** — generates 3 SEO listing-copy variants per unit.
2. **Maintenance triage** — classifies a tenant's free-text description into `issue_type` + suggested `urgency`, with a non-blocking conflict warning.
3. **Rent comp** — pulls market rent for a unit from Rentometer (or a clearly-labeled mock when the key is unset).

All three are designed to **degrade gracefully**. The site keeps working with no environment variables set — features simply turn themselves off and the UI/API surface an explicit "ai_enabled: false" / "mock-fallback" signal.

## Environment variables

| Var | Owner | Required for | When unset |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | shared with S3 | Listing writer, maintenance triage | Both endpoints return empty results / null and log one warning per cold start. |
| `RENTOMETER_API_KEY` | S10 | Rent comp | Returns a ±15 % mock-fallback estimate, clearly labeled in the UI. |

These are server-only secrets. Set them in the Cloudflare Pages / Vercel environment and in `apps/web/.dev.vars` for local dev.

## Model + cost

- Model: `claude-sonnet-4-6`. Picked for the combination of cost (cheaper than Opus) and adequate quality on classification and short-form copy.
- Prompt caching: the listing writer marks the unit + building context block with `cache_control: { type: 'ephemeral' }`. Re-running with a tweaked `notes` value is therefore ~10 % of the cost of the first call (cache reads ~0.1× of input price). Cache TTL is 5 minutes by default — long enough for an admin iterating on copy.
- Triage prompt is small (system ~250 tokens + description ≤ 2k chars) and capped to 200 output tokens. Typical latency in our local tests: 500–900 ms; designed for inline use on form blur.

## Endpoints

| Method + path | Purpose | Auth |
| --- | --- | --- |
| `POST /api/admin/units/:id/generate-listing` | Body `{ notes? }` → `{ ok, variants[], ai_enabled }`. | Admin session cookie. |
| `POST /api/maintenance-triage` | Body `{ description, issue_type?, urgency? }` → `{ ok, result, ai_enabled }`. Public. | None (rate-limit at the edge if abuse becomes an issue). |
| `GET /api/admin/units/:id/rent-comp` | → `{ ok, rent_comp, summary }`. Source = `rentometer` or `mock-fallback`. | Admin session cookie. |

Every endpoint returns 200 even when AI is disabled. Failures during a call (rate limits, parse errors, etc.) are logged and surfaced as empty results — never as 5xx — so callers don't need to handle a degraded mode separately.

## UI surfaces

- **`/admin/listing-writer/:unit_id`** — admin-only page. Click "Generate variants", optionally pass notes, then "Use this draft" copies the chosen variant into a preview box ready for an admin to paste into the unit's `description_md`. Persistence to the DB is out of scope for S10 — wire that up alongside the units CRUD work.
- **`MaintenanceTriageHint`** (React island) — banner shown beneath the description textarea on the public maintenance form. Calls `/api/maintenance-triage` with a 700 ms debounce. Shows an amber banner when the user's urgency choice conflicts with the AI's suggestion by 2 or more levels.
- **`RentCompBadge.astro`** — small inline badge that hits `/api/admin/units/:id/rent-comp` client-side and shows the market range + the unit's deviation from median. Hides itself silently if the viewer isn't an admin.

## Pending integrations (handled at merge time)

S10 deliberately does NOT modify `MaintenanceForm.tsx` or `UnitCard.astro` (other agents own those files). At merge time:

1. **`MaintenanceForm.tsx`** — add the inline hint just after the description textarea:

   ```tsx
   import { MaintenanceTriageHint } from './MaintenanceTriageHint'
   // …inside the form, after the description <textarea>:
   <MaintenanceTriageHint
     description={watch('description') ?? ''}
     issueType={issueType ?? null}
     urgency={urgency ?? null}
   />
   ```

   `description` should be tracked via `watch()` so the hint re-fires as the user types; the existing form already calls `watch('description')`-equivalent at the top of the component, so this should be a 2-line drop-in.

2. **`UnitCard.astro`** — add the badge near the rent figure:

   ```astro
   ---
   import RentCompBadge from './RentCompBadge.astro'
   ---
   <span class="text-lg font-bold">{rent}<span class="text-sm font-normal text-gray-500">/mo</span></span>
   <RentCompBadge unitId={u.id} />
   ```

   The badge fetches data client-side and removes itself for non-admin viewers, so it's safe to include unconditionally on the card.

## Failure modes & monitoring

- `[ai-helpers]` log lines tag every Claude call with latency and cache-hit/creation counts. Watch for `cache_read_input_tokens === 0` across repeated requests with the same unit — that means a silent invalidator is in the context block (e.g. a per-request timestamp leaked in).
- `[rent-comp]` log lines tag every Rentometer call with sample count. Persistent fallback warnings ("only N comps found") for the same unit mean the address doesn't have enough Rentometer coverage; treat that unit's badge as informational only.
- The maintenance triage prompt is intentionally conservative on the "low" end — never downgrades to "low" when there's safety uncertainty. If you see false-positive emergency suggestions for clearly trivial issues, tighten the wording of the urgency tier examples in `TRIAGE_SYSTEM` and re-deploy.
