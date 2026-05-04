export function publicPhotoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/public-photos/${path}`
}

interface TransformOpts {
  width?: number
  quality?: number
  format?: 'webp' | 'jpg' | 'png'
}

export function transformedPhotoUrl(supabaseUrl: string, path: string, opts: TransformOpts = {}): string {
  const params = new URLSearchParams()
  if (opts.width) params.set('width', String(opts.width))
  if (opts.quality) params.set('quality', String(opts.quality))
  if (opts.format) params.set('format', opts.format)
  const qs = params.toString()
  return `${supabaseUrl}/storage/v1/render/image/public/public-photos/${path}${qs ? '?' + qs : ''}`
}
