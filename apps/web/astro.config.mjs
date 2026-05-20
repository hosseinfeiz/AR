import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import sentry from '@sentry/astro'
import AstroPWA from '@vite-pwa/astro'

const SITE = process.env.PUBLIC_SITE_URL ?? 'https://ar-management.example'

// Detect deploy target.
// CF_PAGES is set on Cloudflare Pages builds.
// VERCEL is set on Vercel builds.
// DEPLOY_TARGET=cloudflare can force CF locally.
const isCloudflare = !!process.env.CF_PAGES || process.env.DEPLOY_TARGET === 'cloudflare'

async function pickAdapter() {
  if (isCloudflare) {
    const { default: cloudflare } = await import('@astrojs/cloudflare')
    return cloudflare({
      imageService: 'compile',
      // No KV/session bindings yet — we use cookies directly for mock auth.
    })
  }
  const { default: vercel } = await import('@astrojs/vercel')
  return vercel({ webAnalytics: { enabled: false } })
}

export default defineConfig({
  site: SITE,
  output: 'server',
  adapter: await pickAdapter(),
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes('/api/') && !page.endsWith('/robots.txt'),
    }),
    AstroPWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // We ship our own /manifest.webmanifest in public/.
      includeAssets: ['favicon.svg', 'favicon.ico', 'manifest.webmanifest', 'icons/*.png'],
      workbox: {
        // Skip raw building photos from precache — they're large and the runtime
        // image-cache below handles them lazily.
        globPatterns: ['**/*.{js,css,html,svg,ico,webmanifest}', 'icons/*.png'],
        globIgnores: ['**/buildings/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Private routes must never be served from cache.
        navigateFallback: null,
        navigateFallbackDenylist: [/^\/api\//, /^\/portal\//, /^\/admin\//],
        runtimeCaching: [
          {
            // Static images (buildings, units) — cache-first with a 30d max.
            urlPattern: ({ request, url }) =>
              request.destination === 'image' &&
              !url.pathname.startsWith('/api/') &&
              !url.pathname.startsWith('/portal/') &&
              !url.pathname.startsWith('/admin/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ar-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Marketing pages — stale-while-revalidate, never touching auth routes.
            urlPattern: ({ url, request }) =>
              request.mode === 'navigate' &&
              !url.pathname.startsWith('/api/') &&
              !url.pathname.startsWith('/portal/') &&
              !url.pathname.startsWith('/admin/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ar-pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    // Sentry has Node-specific deps; skip on Cloudflare to keep the Worker bundle small.
    ...(process.env.PUBLIC_SENTRY_DSN && !isCloudflare
      ? [sentry({
          dsn: process.env.PUBLIC_SENTRY_DSN,
          sourceMapsUploadOptions: { project: 'ar-web', authToken: process.env.SENTRY_AUTH_TOKEN },
        })]
      : []),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
