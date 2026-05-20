# Listings & marketing funnel features (S7)

Operator-facing notes for the conversion-lift features added to the listings,
building, and unit pages.

## Features at a glance

| Feature              | Page(s)                           | Persistence    | Env needed             |
| -------------------- | --------------------------------- | -------------- | ---------------------- |
| Save to favorites    | `/listings`, `/buildings/[slug]`, `/units/[id]`, `/favorites` | `localStorage` | none                   |
| Compare drawer       | `/listings`, `/favorites`         | `localStorage` | none                   |
| Map view             | `/listings?view=map`              | n/a            | `PUBLIC_MAPBOX_TOKEN`  |
| Responsive heroes    | `/buildings/[slug]`, `/units/[id]`| n/a            | none (Supabase render endpoint used when remote) |
| ApartmentComplex JSON-LD | `/buildings/[slug]`           | n/a            | none                   |

## Favorites — localStorage only

- Storage key: `ar_favorites` (comma-separated unit ids).
- Buildings can also be favorited via `ar_favorites_buildings`.
- The page emits a `ar:favorites-changed` window event whenever the set
  changes — islands listen to it instead of polling.
- Because favorites are client-side only, **there is nothing to migrate** and
  no privacy implications beyond local browser storage. A user clearing
  their browser data will lose their saved list.
- Dedicated `/favorites` page reads from localStorage and renders the saved
  units. Server-side SSR returns an empty state shell so the page is fast and
  SEO-safe; the script swaps in the populated list on hydration.

## Compare drawer

- Sticky bottom drawer on `/listings` and `/favorites`.
- Shows up to 3 favorited units side-by-side (rent, beds/baths, sqft,
  availability). Anything past 3 is summarised as "+N more saved" with a
  link to the full favorites page.
- Removing from the drawer updates `ar_favorites` and broadcasts the event,
  so every heart icon on the page flips back to the off state immediately.

## Map view — env-gated

- The "Map view" toggle pivots `/listings` between a list and a Mapbox map.
- **Env var:** `PUBLIC_MAPBOX_TOKEN` (public token, scoped to the production
  domain in the Mapbox dashboard).
- When the token is **not** set, the island renders:

  > Map view unavailable — Operator needs to set `PUBLIC_MAPBOX_TOKEN`.

  The rest of the listings page (filters, cards, compare, favorites) keeps
  working normally — the map is the only thing disabled.
- Building coordinates: hard-coded in `apps/web/src/pages/listings.astro`
  under `COORDS`. When new buildings are added with real DB coords, swap that
  lookup for the column data. Today's fixtures use approximate Richfield + New
  Hope lat/lngs.
- Mapbox GL JS is loaded with a dynamic `import('mapbox-gl')` so it stays out
  of the main bundle and doesn't load at all on the list view.

## Responsive hero (`BuildingHero.astro`)

- `<picture>` element with srcset across 400 / 800 / 1200 / 1920 widths.
- Uses Supabase's `render/image/public/...` endpoint when the photo is a
  storage path. For local public assets (eg. `/buildings/grass-lake-manor.png`)
  the same URL is emitted at every width — browsers still pick the smallest
  qualifying entry via the `sizes` attribute, but no server-side resize
  happens.
- `priority` (default `true`) uses `loading="eager"`, `decoding="sync"`, and
  `fetchpriority="high"` since the hero is above the fold.
- **Distinct from `PhotoGallery`** — that's still used for in-page galleries
  below the hero.

## ApartmentComplex JSON-LD

- Emitted from `/buildings/[slug]` via the `jsonLd` prop on `<Base>` →
  `<Seo>`.
- Shape (Schema.org `ApartmentComplex`):
  - `name`, `url`, `description`, `telephone`, `email`
  - `address` (`PostalAddress`)
  - `numberOfRooms` — total contained unit count (conservative
    interpretation; replace with bedroom sum if SEO wants stricter mapping)
  - `amenityFeature[]` (`LocationFeatureSpecification` per amenity)
  - `containsPlace[]` — one `Apartment` node per unit, each with
    `numberOfRooms`, `numberOfBathroomsTotal`, optional `floorSize`, and
    `offers` (price, currency, availability).
- Unit page emits a standalone `Apartment` node (unchanged in spirit from
  the previous inline JSON, but now built via the shared helper).

### Verifying JSON-LD

```sh
pnpm --filter @ar/web build
grep -A1 'application/ld+json' dist/buildings/grass-lake-manor/index.html
```

You should see a single `<script type="application/ld+json">` containing
`"@type":"ApartmentComplex"` followed by the unit `containsPlace` array.

Optional: paste the JSON into the [Schema.org validator](https://validator.schema.org/)
or [Google Rich Results Test](https://search.google.com/test/rich-results) — both
should report zero errors.

## Setting the Mapbox token in production

1. Create a public token at https://account.mapbox.com/access-tokens/.
2. Restrict the token to the production domain (URL restrictions panel).
3. Set the env var on the hosting platform:
   - **Vercel:** Project Settings → Environment Variables → add
     `PUBLIC_MAPBOX_TOKEN`.
   - **Cloudflare Pages/Workers:** `wrangler.toml` `[vars]` (note: this file
     is not owned by S7; have an operator update it).
4. Redeploy. The next request to `/listings?view=map` should render the map.
5. Verify with the browser DevTools network tab — you should see requests to
   `api.mapbox.com` after toggling to Map view, and no console errors.
