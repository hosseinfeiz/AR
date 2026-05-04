export const prerender = false
import type { APIRoute } from 'astro'
import { clearSession } from '../../lib/auth'

export const POST: APIRoute = async ({ cookies }) => {
  clearSession(cookies)
  return new Response(JSON.stringify({ ok: true, redirect: '/' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
