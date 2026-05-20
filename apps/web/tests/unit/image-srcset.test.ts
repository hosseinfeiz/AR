import { describe, expect, it } from 'vitest'
import { buildHeroSrcset, DEFAULT_HERO_WIDTHS } from '../../src/lib/image-srcset'

const SUPA = 'https://example.supabase.co'

describe('buildHeroSrcset', () => {
  it('builds srcset across default widths via transform endpoint', () => {
    const r = buildHeroSrcset(SUPA, 'buildings/grass-lake/0.jpg')
    const expectedWidths = [400, 800, 1200, 1920]
    expect(DEFAULT_HERO_WIDTHS).toEqual(expectedWidths)
    for (const w of expectedWidths) {
      expect(r.srcset).toContain(`width=${w}`)
      expect(r.srcset).toContain(`${w}w`)
    }
    // Largest width supplies the default `src`.
    expect(r.src).toContain('width=1920')
    expect(r.sizes).toMatch(/max-width: 640px/)
  })

  it('emits raw URL for local public-path images', () => {
    const r = buildHeroSrcset(SUPA, '/buildings/grass-lake-manor.png')
    expect(r.src).toBe('/buildings/grass-lake-manor.png')
    // All widths get the same URL, but the descriptors are still per-width.
    expect(r.srcset).toBe(
      '/buildings/grass-lake-manor.png 400w, /buildings/grass-lake-manor.png 800w, /buildings/grass-lake-manor.png 1200w, /buildings/grass-lake-manor.png 1920w',
    )
  })

  it('passes through absolute URLs untouched', () => {
    const url = 'https://cdn.example.com/photo.jpg'
    const r = buildHeroSrcset(SUPA, url)
    expect(r.src).toBe(url)
    expect(r.srcset).toContain(`${url} 1920w`)
  })

  it('honours custom widths + sizes + quality', () => {
    const r = buildHeroSrcset(SUPA, 'p/0.jpg', {
      widths: [320, 640],
      quality: 50,
      sizes: '100vw',
    })
    expect(r.sizes).toBe('100vw')
    expect(r.srcset.split(', ')).toHaveLength(2)
    expect(r.srcset).toContain('width=320')
    expect(r.srcset).toContain('width=640')
    expect(r.srcset).toContain('quality=50')
    expect(r.src).toContain('width=640')
  })
})
