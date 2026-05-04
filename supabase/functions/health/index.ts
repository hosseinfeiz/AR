import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async () => {
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error } = await sb.from('buildings').select('id').limit(1)
    if (error) throw error
    return Response.json({ ok: true, ts: new Date().toISOString() })
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 503 })
  }
})
