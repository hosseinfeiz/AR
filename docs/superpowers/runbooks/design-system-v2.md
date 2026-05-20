# Design system v2 — dark mode + tokens

## Single source of truth

All color, surface, border and shadow values live as CSS custom properties in
`apps/web/src/styles/tokens.css`. Components should consume `var(--color-*)`
through the semantic helper classes in `global.css` (`.surface`,
`.surface-muted`, `.text-muted`, `.border-default`, …) — never hard-code hex
values or raw Tailwind palette utilities (`bg-white`, `text-gray-900`, etc.).

## Theme resolution order

The active theme is determined by three signals, in order of precedence:

1. **`[data-theme="dark"]` / `[data-theme="light"]` on `<html>`** — set by the
   `ThemeToggle` component when the user makes an explicit choice. Persisted
   to `localStorage` under the key `ar_theme`.
2. **`prefers-color-scheme: dark`** — falls through when no explicit choice
   has been made.
3. **Default light values on `:root`** — applied when neither of the above
   matches.

The values in (1) and (2) are identical so the experience is the same whether
the user toggled manually or the OS picked it.

## Avoiding flash-of-unstyled-content (FOUC)

`ThemeToggle.astro` ships a tiny `is:inline` script that runs before paint and
reads `localStorage.ar_theme`. If a value is present, it sets the
`data-theme` attribute on `<html>` synchronously. Without this, a brief flash
of the default light theme would be visible on every cold load when the user
has chosen dark.

## Adding a new token

1. Pick a semantic name (`--color-text-success`, not `--color-green-500`).
2. Add it to `:root` in `tokens.css` with the light value.
3. Add the dark variant in **both** the `@media (prefers-color-scheme: dark)`
   block and the `[data-theme="dark"]` block. They must stay in sync.
4. Optionally add a `[data-theme="light"]` override if the default light
   value differs from the OS-light value.
5. If the token is broadly useful, add a helper class in `global.css`.

## Lightbox

`PhotoGallery.astro` renders thumbnails with a `data-lightbox-src` attribute
pointing at the full-resolution image. The `LightboxModal` React island
(`apps/web/src/components/islands/LightboxModal.tsx`) scans the gallery
container at hydration time and attaches click/keyboard handlers. Once open
it offers:

- **Arrow Left / Arrow Right** — previous / next photo
- **Esc** — close
- **Pinch** — two-finger zoom on touch devices (clamped 1×–4×)
- **Double-click** — toggle 1×/2× zoom on pointer devices
- **Focus trap** — Tab/Shift-Tab cycles inside the dialog only

The modal sets `role="dialog"` and `aria-modal="true"` and restores focus to
the originating thumbnail when closed.
