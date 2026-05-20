// Live availability picker — replaces the old "3 preferred dates" UI.
//
// Renders a 7-day strip of days; clicking a day fetches /api/showings/availability
// for that day and displays the 30-minute slots. Each slot is one of:
//   - open    → selectable
//   - booked  → greyed out
//   - blocked → greyed out + label
//
// In mock mode we synthesise a few slots locally so the dev experience works
// without a live Supabase / Google integration.

import { useEffect, useMemo, useState } from 'react'

export interface PickedSlot {
  start: string
  end: string
}

interface Slot {
  start: string
  end: string
  status: 'open' | 'booked' | 'blocked'
}

interface Props {
  buildingId: string | null
  value: PickedSlot | null
  onChange: (slot: PickedSlot | null) => void
  mockMode?: boolean
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function generateMockSlots(day: Date): Slot[] {
  // 9:00, 9:30, 10:00, ..., 17:30 local — mark a couple as booked.
  const out: Slot[] = []
  for (let h = 9; h < 18; h++) {
    for (const m of [0, 30]) {
      const s = new Date(day)
      s.setHours(h, m, 0, 0)
      const e = new Date(s.getTime() + 30 * 60 * 1000)
      const idx = (h - 9) * 2 + (m === 30 ? 1 : 0)
      const status: Slot['status'] = idx === 4 || idx === 9 ? 'booked' : 'open'
      out.push({ start: s.toISOString(), end: e.toISOString(), status })
    }
  }
  return out
}

export function ShowingPicker({ buildingId, value, onChange, mockMode = false }: Props) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [activeDay, setActiveDay] = useState<Date>(today)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today])

  useEffect(() => {
    let cancelled = false
    if (!buildingId) { setSlots([]); return }
    setLoading(true); setError(null)

    if (mockMode) {
      // Fake a small fetch delay so the UI looks lifelike.
      const id = setTimeout(() => {
        if (!cancelled) { setSlots(generateMockSlots(activeDay)); setLoading(false) }
      }, 80)
      return () => { cancelled = true; clearTimeout(id) }
    }

    const from = new Date(activeDay)
    const to = addDays(activeDay, 1)
    const q = new URLSearchParams({
      building_id: buildingId,
      from: from.toISOString(),
      to: to.toISOString(),
    })
    fetch(`/api/showings/availability?${q.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j.error) { setError(j.error); setSlots([]); return }
        setSlots((j.slots as Slot[]) ?? [])
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [buildingId, activeDay, mockMode])

  if (!buildingId) {
    return <p className="text-sm text-gray-500">Pick a building first.</p>
  }

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Pick a day">
        {days.map((d) => {
          const isActive = d.getTime() === activeDay.getTime()
          return (
            <button
              key={d.toISOString()}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveDay(d)}
              className={`shrink-0 px-3 py-1.5 rounded border text-xs sm:text-sm ${
                isActive
                  ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {fmtDay(d)}
            </button>
          )
        })}
      </div>

      <div className="mt-3">
        {loading && <p className="text-xs text-gray-500">Loading slots…</p>}
        {error && <p className="text-xs text-red-600">Could not load slots: {error}</p>}
        {!loading && !error && slots.length === 0 && (
          <p className="text-xs text-gray-500">No slots available this day.</p>
        )}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1" role="listbox" aria-label="Available time slots">
          {slots.map((s) => {
            const isPicked = value?.start === s.start
            const disabled = s.status !== 'open'
            return (
              <button
                key={s.start}
                type="button"
                role="option"
                aria-selected={isPicked}
                disabled={disabled}
                onClick={() => onChange(isPicked ? null : { start: s.start, end: s.end })}
                className={`px-2 py-1.5 rounded border text-sm ${
                  disabled
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    : isPicked
                      ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                      : 'border-gray-300 hover:border-gray-400'
                }`}
                title={s.status}
              >
                {fmtTime(s.start)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
