import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import sentry from '@sentry/astro'

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
