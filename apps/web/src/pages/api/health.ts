export const prerender = false
import type { APIRoute } from 'astro'
import { checkDbHealth } from '../../lib/data'

export const GET: APIRoute = async () => {
  const result = await checkDbHealth()
  return new Response(JSON.stringify({ ...result, ts: new Date().toISOString() }), {
    status: result.ok ? 200 : 503,
    headers: { 'content-type': 'application/json' },
  })
}
