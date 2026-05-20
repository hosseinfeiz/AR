import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * Theme toggle behaviour — verifies the persistence contract that
 * `ThemeToggle.astro` relies on: clicking the toggle stores 'dark' or
 * 'light' in localStorage under the `ar_theme` key, and on next page
 * load that value is applied to <html data-theme>.
 *
 * These tests use a minimal DOM/localStorage shim rather than spinning
 * up a full browser, because the toggle's behaviour is pure DOM I/O.
 */

type ThemeValue = 'dark' | 'light'

class LocalStorageShim {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

interface HtmlShim {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
}

function makeHtml(): HtmlShim {
  const attrs = new Map<string, string>()
  return {
    getAttribute: (name) => attrs.get(name) ?? null,
    setAttribute: (name, value) => {
      attrs.set(name, value)
    },
  }
}

/** Replicates the toggle's click handler in isolation. */
function toggleTheme(
  html: HtmlShim,
  storage: LocalStorageShim,
  prefersDark: boolean,
): ThemeValue {
  const explicit = html.getAttribute('data-theme')
  const active: ThemeValue =
    explicit === 'dark' || explicit === 'light'
      ? explicit
      : prefersDark
        ? 'dark'
        : 'light'
  const next: ThemeValue = active === 'dark' ? 'light' : 'dark'
  html.setAttribute('data-theme', next)
  storage.setItem('ar_theme', next)
  return next
}

/** Replicates the FOUC-prevention inline script. */
function applyInitial(html: HtmlShim, storage: LocalStorageShim): void {
  const stored = storage.getItem('ar_theme')
  if (stored === 'dark' || stored === 'light') {
    html.setAttribute('data-theme', stored)
  }
}

describe('theme toggle persistence', () => {
  let storage: LocalStorageShim
  let html: HtmlShim

  beforeEach(() => {
    storage = new LocalStorageShim()
    html = makeHtml()
  })

  afterEach(() => {
    storage.clear()
  })

  it('writes "dark" to localStorage when toggling from a light OS preference', () => {
    expect(storage.getItem('ar_theme')).toBeNull()
    const result = toggleTheme(html, storage, /* prefersDark */ false)
    expect(result).toBe('dark')
    expect(storage.getItem('ar_theme')).toBe('dark')
    expect(html.getAttribute('data-theme')).toBe('dark')
  })

  it('writes "light" to localStorage when toggling from a dark OS preference', () => {
    const result = toggleTheme(html, storage, /* prefersDark */ true)
    expect(result).toBe('light')
    expect(storage.getItem('ar_theme')).toBe('light')
    expect(html.getAttribute('data-theme')).toBe('light')
  })

  it('flips between dark and light on successive toggles', () => {
    expect(toggleTheme(html, storage, false)).toBe('dark')
    expect(toggleTheme(html, storage, false)).toBe('light')
    expect(toggleTheme(html, storage, false)).toBe('dark')
  })

  it('applies a persisted theme on next page load to avoid FOUC', () => {
    storage.setItem('ar_theme', 'dark')
    applyInitial(html, storage)
    expect(html.getAttribute('data-theme')).toBe('dark')
  })

  it('does not set data-theme when no choice is persisted (lets OS preference win)', () => {
    applyInitial(html, storage)
    expect(html.getAttribute('data-theme')).toBeNull()
  })

  it('ignores garbage values in localStorage', () => {
    storage.setItem('ar_theme', 'sepia')
    applyInitial(html, storage)
    expect(html.getAttribute('data-theme')).toBeNull()
  })
})
