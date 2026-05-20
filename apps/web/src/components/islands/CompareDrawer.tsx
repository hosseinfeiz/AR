// Sticky bottom drawer that reads favorited unit ids from localStorage and
// renders a side-by-side comparison of up to 3 of them. Unit metadata is
// passed in as a serialized lookup (`unitsByIdJson`) populated by the page —
// this keeps the island self-contained (no fetch) and avoids needing
// per-card data attributes on every render.

import { useEffect, useMemo, useState } from 'react'
import { FAVORITES_EVENT, readFavoriteIds, toggleFavorite } from './FavoritesButton'

export interface CompareUnit {
  id: string
  unit_number: string
  bedrooms: number
  bathrooms: number
  sqft: number | null
  monthly_rent_cents: number
  available_from: string | null
  building_name?: string
  building_slug?: string
}

interface Props {
  // JSON string keyed by unit id → CompareUnit. Server-rendered into the
  // island so we don't need to hit an API.
  unitsByIdJson: string
  maxItems?: number
}

const MAX_ITEMS_DEFAULT = 3

function rentStr(cents: number): string {
  return `$${(cents / 100).toLocaleString()}/mo`
}

function bedsStr(b: number): string {
  return b === 0 ? 'Studio' : `${b} bd`
}

export function CompareDrawer({ unitsByIdJson, maxItems = MAX_ITEMS_DEFAULT }: Props) {
  const unitsById = useMemo<Record<string, CompareUnit>>(() => {
    try {
      return JSON.parse(unitsByIdJson) as Record<string, CompareUnit>
    } catch {
      return {}
    }
  }, [unitsByIdJson])

  const [favIds, setFavIds] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    setFavIds(readFavoriteIds('unit'))
    const onChange = () => setFavIds(readFavoriteIds('unit'))
    window.addEventListener(FAVORITES_EVENT, onChange)
    return () => window.removeEventListener(FAVORITES_EVENT, onChange)
  }, [])

  // Filter to ids that we actually have data for, capped at maxItems.
  const visible = favIds.filter((id) => unitsById[id]).slice(0, maxItems)
  const overflow = favIds.filter((id) => unitsById[id]).length - visible.length

  if (!hydrated || visible.length === 0) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white shadow-2xl">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium"
            aria-expanded={expanded}
          >
            <span className="inline-flex items-center justify-center bg-[var(--color-brand)] text-white rounded-full w-6 h-6 text-xs">
              {visible.length}
            </span>
            Compare {visible.length === 1 ? 'unit' : 'units'}
            {overflow > 0 && (
              <span className="text-xs text-gray-500">(+{overflow} more saved)</span>
            )}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <a
            href="/favorites"
            className="text-sm text-[var(--color-brand)] hover:underline"
          >
            View all favorites →
          </a>
        </div>

        {expanded && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-3 font-medium">Unit</th>
                  <th className="py-2 pr-3 font-medium">Rent</th>
                  <th className="py-2 pr-3 font-medium">Beds / Baths</th>
                  <th className="py-2 pr-3 font-medium">Sqft</th>
                  <th className="py-2 pr-3 font-medium">Available</th>
                  <th className="py-2 pr-3 font-medium" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((id) => {
                  const u = unitsById[id]!
                  return (
                    <tr key={id} className="border-t border-gray-100">
                      <td className="py-2 pr-3">
                        <a
                          href={`/units/${u.id}`}
                          className="font-medium text-[var(--color-brand)] hover:underline"
                        >
                          Unit {u.unit_number}
                        </a>
                        {u.building_name && (
                          <div className="text-xs text-gray-500">{u.building_name}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">{rentStr(u.monthly_rent_cents)}</td>
                      <td className="py-2 pr-3">
                        {bedsStr(u.bedrooms)} · {u.bathrooms} ba
                      </td>
                      <td className="py-2 pr-3">{u.sqft ? `${u.sqft} sqft` : '—'}</td>
                      <td className="py-2 pr-3">{u.available_from ?? '—'}</td>
                      <td className="py-2 pr-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleFavorite(u.id, 'unit')}
                          className="text-xs text-gray-500 hover:text-red-600"
                          aria-label={`Remove unit ${u.unit_number} from comparison`}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default CompareDrawer
