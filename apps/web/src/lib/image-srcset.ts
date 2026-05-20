// Build a responsive `srcset` + `sizes` for a Supabase-hosted photo.
//
// Local public assets (paths starting with `/` or `http`) can't be transformed
// by Supabase's render endpoint, so we emit the same URL for every breakpoint
// — the browser will still pick the smallest matching `<source>`, just without
// the bandwidth win from server-side resizing.
//
// Default widths target common viewports: 400 (small phones), 800 (large
// phones / small tablets), 1200 (laptops), 1920 (desktop / retina).
// Tests live in `tests/unit/image-srcset.test.ts`.

import { transformedPhotoUrl } from './photo-url'

export const DEFAULT_HERO_WIDTHS = [400, 800, 1200, 1920] as const

export interface SrcsetResult {
  src: string // default fallback (largest)
  srcset: string
  sizes: string
}

interface BuildOpts {
  widths?: readonly number[]
  quality?: number
  format?: 'webp' | 'jpg' | 'png'
  sizes?: string
}

function isLocalOrAbsolute(path: string): boolean {
  return path.startsWith('/') || path.startsWith('http://') || path.startsWith('https://')
}

export function buildHeroSrcset(
  supabaseUrl: string,
  storagePath: string,
  opts: BuildOpts = {},
): SrcsetResult {
  const widths = opts.widths ?? DEFAULT_HERO_WIDTHS
  const quality = opts.quality ?? 75
  const format = opts.format ?? 'webp'
  const sizes = opts.sizes ?? '(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1024px'

  if (isLocalOrAbsolute(storagePath)) {
    // No transform endpoint available — emit the same URL for every width.
    // Browsers will still respect `sizes`, just without bandwidth savings.
    return {
      src: storagePath,
      srcset: widths.map((w) => `${storagePath} ${w}w`).join(', '),
      sizes,
    }
  }

  const urls = widths.map((w) => ({
    w,
    url: transformedPhotoUrl(supabaseUrl, storagePath, { width: w, quality, format }),
  }))
  const largest = urls[urls.length - 1]!
  return {
    src: largest.url,
    srcset: urls.map(({ w, url }) => `${url} ${w}w`).join(', '),
    sizes,
  }
}
