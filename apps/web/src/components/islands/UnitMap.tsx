// Mapbox map with one pin per building. Env-gated by `PUBLIC_MAPBOX_TOKEN`:
// when unset the island renders a clear notice instead of trying to load
// Mapbox GL JS (so the rest of the listings page works without the token).
//
// `mapbox-gl` is loaded dynamically so it doesn't enter the main bundle and
// so the missing-token path can short-circuit before any heavy dependency
// resolves.

import { useEffect, useRef, useState } from 'react'

export interface MapBuilding {
  id: string
  slug: string
  name: string
  address: string
  lng: number
  lat: number
  units: {
    id: string
    unit_number: string
    bedrooms: number
    monthly_rent_cents: number
  }[]
}

interface Props {
  buildingsJson: string
  token?: string
}

export function UnitMap({ buildingsJson, token }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<MapBuilding | null>(null)

  let buildings: MapBuilding[] = []
  try {
    buildings = JSON.parse(buildingsJson) as MapBuilding[]
  } catch {
    buildings = []
  }

  useEffect(() => {
    if (!token || buildings.length === 0 || !containerRef.current) return
    let map: any = null
    let cancelled = false

    ;(async () => {
      try {
        const mod: any = await import('mapbox-gl')
        const mapbox = mod.default ?? mod
        // Inject the bundled stylesheet (loaded as a side-effect import would
        // require a CSS plugin; we attach via <link> instead).
        if (!document.getElementById('mapbox-gl-css')) {
          const link = document.createElement('link')
          link.id = 'mapbox-gl-css'
          link.rel = 'stylesheet'
          link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css'
          document.head.appendChild(link)
        }
        if (cancelled) return
        mapbox.accessToken = token

        // Centre on the average of all building coordinates.
        const avgLng = buildings.reduce((s, b) => s + b.lng, 0) / buildings.length
        const avgLat = buildings.reduce((s, b) => s + b.lat, 0) / buildings.length

        map = new mapbox.Map({
          container: containerRef.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [avgLng, avgLat],
          zoom: buildings.length === 1 ? 14 : 11,
        })

        map.addControl(new mapbox.NavigationControl({ showCompass: false }), 'top-right')

        for (const b of buildings) {
          const el = document.createElement('button')
          el.type = 'button'
          el.className = 'mapbox-marker'
          el.setAttribute('aria-label', `View units at ${b.name}`)
          el.style.cssText = [
            'background:var(--color-brand,#0d9488)',
            'color:white',
            'border:0',
            'border-radius:9999px',
            'padding:4px 10px',
            'font-size:12px',
            'font-weight:600',
            'box-shadow:0 1px 3px rgba(0,0,0,0.3)',
            'cursor:pointer',
            'white-space:nowrap',
          ].join(';')
          el.textContent = `${b.units.length} unit${b.units.length === 1 ? '' : 's'}`
          el.addEventListener('click', () => setSelected(b))
          new mapbox.Marker(el).setLngLat([b.lng, b.lat]).addTo(map)
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load map')
      }
    })()

    return () => {
      cancelled = true
      try {
        map?.remove()
      } catch {
        // ignore
      }
    }
  }, [buildings, token])

  if (!token) {
    return (
      <div
        className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-600 bg-gray-50"
        role="status"
      >
        <p className="font-medium">Map view unavailable</p>
        <p className="text-sm mt-1">
          Operator needs to set <code className="bg-white px-1 py-0.5 rounded border">PUBLIC_MAPBOX_TOKEN</code>.
        </p>
      </div>
    )
  }

  if (buildings.length === 0) {
    return (
      <div className="border border-gray-200 rounded-xl p-6 text-sm text-gray-600 bg-white">
        No mappable buildings — units in the current filter don't have coordinates.
      </div>
    )
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-[420px] sm:h-[520px] rounded-xl overflow-hidden border border-gray-200"
        aria-label="Map of available buildings"
      />
      {error && (
        <div className="absolute inset-x-3 top-3 bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}
      {selected && (
        <div
          className="absolute bottom-3 inset-x-3 sm:inset-x-auto sm:right-3 sm:w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4"
          role="dialog"
          aria-label={`Units at ${selected.name}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">{selected.name}</h3>
              <p className="text-xs text-gray-500">{selected.address}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-gray-400 hover:text-gray-700"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {selected.units.slice(0, 5).map((u) => (
              <li key={u.id} className="text-sm flex justify-between items-baseline gap-2">
                <a
                  href={`/units/${u.id}`}
                  className="text-[var(--color-brand)] hover:underline"
                >
                  Unit {u.unit_number} · {u.bedrooms === 0 ? 'Studio' : `${u.bedrooms} bd`}
                </a>
                <span className="text-gray-700">
                  ${(u.monthly_rent_cents / 100).toLocaleString()}/mo
                </span>
              </li>
            ))}
          </ul>
          <a
            href={`/buildings/${selected.slug}`}
            className="block mt-3 text-sm font-medium text-[var(--color-brand)] hover:underline"
          >
            View all units at {selected.name} →
          </a>
        </div>
      )}
    </div>
  )
}

export default UnitMap
