// Heart icon button that toggles a unit/building id in localStorage.
//
// Persistence is client-only — no server roundtrip. Keys:
//   ar_favorites          — comma-separated list of unit ids
//   ar_favorites_buildings — comma-separated list of building ids
//
// Emits a `ar:favorites-changed` window event so other islands (eg. the
// compare drawer) can react without polling.

import { useEffect, useState } from 'react'

const STORAGE_KEYS = {
  unit: 'ar_favorites',
  building: 'ar_favorites_buildings',
} as const

export type FavoriteKind = keyof typeof STORAGE_KEYS

export const FAVORITES_EVENT = 'ar:favorites-changed'

function readSet(kind: FavoriteKind): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[kind])
    if (!raw) return new Set()
    return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))
  } catch {
    return new Set()
  }
}

function writeSet(kind: FavoriteKind, ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEYS[kind], Array.from(ids).join(','))
    window.dispatchEvent(new CustomEvent(FAVORITES_EVENT, { detail: { kind } }))
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function readFavoriteIds(kind: FavoriteKind = 'unit'): string[] {
  return Array.from(readSet(kind))
}

export function isFavorite(id: string, kind: FavoriteKind = 'unit'): boolean {
  return readSet(kind).has(id)
}

export function toggleFavorite(id: string, kind: FavoriteKind = 'unit'): boolean {
  const set = readSet(kind)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  writeSet(kind, set)
  return set.has(id)
}

interface Props {
  id: string
  kind?: FavoriteKind
  label?: string
  className?: string
}

export function FavoritesButton({ id, kind = 'unit', label, className }: Props) {
  const [active, setActive] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    setActive(isFavorite(id, kind))
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as { kind?: FavoriteKind } | undefined
      if (!detail || detail.kind === kind) setActive(isFavorite(id, kind))
    }
    window.addEventListener(FAVORITES_EVENT, onChange)
    return () => window.removeEventListener(FAVORITES_EVENT, onChange)
  }, [id, kind])

  function handle(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    const next = toggleFavorite(id, kind)
    setActive(next)
  }

  const aria = active ? `Remove from favorites` : `Save to favorites`
  return (
    <button
      type="button"
      onClick={handle}
      aria-pressed={active}
      aria-label={aria}
      title={aria}
      data-favorite-id={id}
      data-favorite-kind={kind}
      className={
        className ??
        `inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/90 border border-gray-200 backdrop-blur hover:border-[var(--color-brand)] transition ${
          hydrated && active ? 'text-red-500' : 'text-gray-400'
        }`
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill={hydrated && active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {label && <span className="ml-2 text-sm">{label}</span>}
    </button>
  )
}

export default FavoritesButton
