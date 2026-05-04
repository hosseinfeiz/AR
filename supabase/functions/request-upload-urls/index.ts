import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface Body {
  count: number          // 1..5
  turnstile_token: string
  content_type: string   // image/jpeg, image/png, image/webp
}

const ALLOWED_TYPES = new Set(['image/jpeg','image/png','image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: corsHeaders })

  const body = (await req.json()) as Body
  if (!body.count || body.count < 1 || body.count > 5) {
    return Response.json({ error: 'count must be 1..5' }, { status: 400, headers: corsHeaders })
  }
  if (!ALLOWED_TYPES.has(body.content_type)) {
    return Response.json({ error: 'unsupported content_type' }, { status: 400, headers: corsHeaders })
  }

  // Verify Turnstile
  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret: Deno.env.get('TURNSTILE_SECRET_KEY')!,
      response: body.turnstile_token,
    }),
  }).then((r) => r.json())
  if (!verify.success) {
    return Response.json({ error: 'turnstile failed' }, { status: 403, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const tempId = crypto.randomUUID()
  const uploads: { path: string; signedUrl: string; token: string }[] = []
  const ext = body.content_type === 'image/png' ? 'png' : body.content_type === 'image/webp' ? 'webp' : 'jpg'

  for (let i = 0; i < body.count; i++) {
    const path = `incoming/${tempId}/${i}.${ext}`
    const { data, error } = await supabase.storage
      .from('maintenance-uploads')
      .createSignedUploadUrl(path)
    if (error || !data) {
      return Response.json({ error: error?.message ?? 'failed' }, { status: 500, headers: corsHeaders })
    }
    uploads.push({ path, signedUrl: data.signedUrl, token: data.token })
  }

  return Response.json({ temp_id: tempId, max_bytes: MAX_BYTES, uploads }, { headers: corsHeaders })
})
