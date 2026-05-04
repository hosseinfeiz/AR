import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import vercel from '@astrojs/vercel'
import tailwindcss from '@tailwindcss/vite'
import sentry from '@sentry/astro'

const SITE = process.env.PUBLIC_SITE_URL ?? 'https://ar-management.example'

export default defineConfig({
  site: SITE,
  output: 'server',
  adapter: vercel({
    webAnalytics: { enabled: false },
  }),
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.includes('/api/') && !page.endsWith('/robots.txt'),
    }),
    ...(process.env.PUBLIC_SENTRY_DSN ? [sentry({
      dsn: process.env.PUBLIC_SENTRY_DSN,
      sourceMapsUploadOptions: { project: 'ar-web', authToken: process.env.SENTRY_AUTH_TOKEN },
    })] : []),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
