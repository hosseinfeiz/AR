import { describe, expect, it } from 'vitest'
import { publicPhotoUrl, transformedPhotoUrl } from '../../src/lib/photo-url'

const BASE = 'https://example.supabase.co'

describe('publicPhotoUrl', () => {
  it('builds a public bucket URL', () => {
    expect(publicPhotoUrl(BASE, 'units/abc/0.jpg'))
      .toBe('https://example.supabase.co/storage/v1/object/public/public-photos/units/abc/0.jpg')
  })
})

describe('transformedPhotoUrl', () => {
  it('builds a render/image URL with width and quality', () => {
    expect(transformedPhotoUrl(BASE, 'units/abc/0.jpg', { width: 1600, quality: 75, format: 'webp' }))
      .toBe('https://example.supabase.co/storage/v1/render/image/public/public-photos/units/abc/0.jpg?width=1600&quality=75&format=webp')
  })
})
