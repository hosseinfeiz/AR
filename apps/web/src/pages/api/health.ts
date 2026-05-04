export const prerender = false
import type { APIRoute } from 'astro'
import { supabase } from '../../lib/supabase'

export const GET: APIRoute = async () => {
  try {
    const { error } = await supabase.from('buildings').select('id').limit(1)
    if (error) throw error
    return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }), {
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 503, headers: { 'content-type': 'application/json' },
    })
  }
}
