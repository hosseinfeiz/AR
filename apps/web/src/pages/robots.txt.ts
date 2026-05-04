import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  const isPreview = process.env.VERCEL_ENV === 'preview'
  const body = isPreview
    ? `User-agent: *\nDisallow: /\n`
    : `User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap-index.xml\n`
  return new Response(body, { headers: { 'content-type': 'text/plain' } })
}
