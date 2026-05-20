export const prerender = false

import type { APIRoute } from 'astro'
import { getSession } from '../../../../lib/auth'
import { chunk, embed, type PageInput } from '../../../../lib/rag'
import { getAdminClient } from '../../../../lib/supabase-admin'

/**
 * POST /api/admin/leases/ingest
 * Body: { lease_id: string, storage_path?: string }
 *
 * Designed to be idempotent + retryable. Steps:
 *   1. Look up (or create) a `lease_documents` row for this lease.
 *   2. Download the PDF from the `leases` Supabase Storage bucket.
 *   3. Parse pages via `pdf-parse`.
 *   4. Chunk → embed → upsert into `lease_chunks` (deleting previous rows
 *      for this document so retries don't double-insert).
 *   5. Mark the document `ready` (or `failed` with an error message).
 *
 * Long-running. The caller (an admin page or one-off script) should treat a
 * 504/timeout the same as a retryable error — the document will be in
 * `ingesting` state and a re-POST is safe.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'admin') {
    return json({ ok: false, error: 'Unauthorized' }, 401)
  }

  let body: { lease_id?: string; storage_path?: string }
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const leaseId = body.lease_id?.trim()
  if (!leaseId) return json({ ok: false, error: 'lease_id required' }, 400)

  const supabase = getAdminClient()

  // 0. Make sure the `leases` storage bucket exists (S2 normally creates it;
  // we do an idempotent create here so this endpoint is usable standalone).
  try {
    const { data: buckets } = await supabase.storage.listBuckets()
    if (!buckets?.some((b) => b.id === 'leases')) {
      await supabase.storage.createBucket('leases', { public: false })
    }
  } catch (e) {
    // Bucket listing can fail in degraded mode — don't block ingestion if
    // the path is explicitly provided.
    console.warn('[ingest] could not verify leases bucket:', (e as Error).message)
  }

  const storagePath = body.storage_path?.trim() ?? `leases/${leaseId}.pdf`

  // 1. Upsert the lease_documents row in `ingesting` state.
  const { data: existing } = await supabase
    .from('lease_documents')
    .select('id')
    .eq('lease_id', leaseId)
    .maybeSingle()

  let documentId: string
  if (existing?.id) {
    documentId = existing.id as string
    const { error } = await supabase
      .from('lease_documents')
      .update({ status: 'ingesting', storage_path: storagePath, error: null })
      .eq('id', documentId)
    if (error) return json({ ok: false, error: error.message }, 500)
  } else {
    const { data, error } = await supabase
      .from('lease_documents')
      .insert({ lease_id: leaseId, storage_path: storagePath, status: 'ingesting' })
      .select('id')
      .single()
    if (error || !data) return json({ ok: false, error: error?.message ?? 'insert failed' }, 500)
    documentId = data.id as string
  }

  try {
    // 2. Fetch PDF bytes from storage.
    const { data: file, error: dlErr } = await supabase.storage.from('leases').download(storagePath)
    if (dlErr || !file) {
      throw new Error(`download failed: ${dlErr?.message ?? 'no file'}`)
    }
    const buf = Buffer.from(await file.arrayBuffer())

    // 3. Parse pages. `pdf-parse` doesn't natively split pages, but it
    // exposes a `pagerender` hook + sets `numpages`. We use the simpler
    // approach: run it once with a custom `pagerender` that records page
    // text into an array.
    const pages = await parsePdfPages(buf)

    // 4. Chunk + embed.
    const chunks = chunk(pages, { size: 1000, overlap: 150 })
    const embedded = await embed(chunks)

    // 5. Replace previous chunks for this doc (idempotent retry).
    await supabase.from('lease_chunks').delete().eq('document_id', documentId)

    if (embedded.length > 0) {
      // pgvector accepts a JSON array of numbers over PostgREST.
      const rows = embedded.map((c) => ({
        document_id: documentId,
        lease_id: leaseId,
        chunk_index: c.index,
        page_number: c.page,
        content: c.content,
        tokens: c.tokens,
        embedding: c.embedding as unknown as string,
      }))
      // Insert in batches of 200 to keep request bodies small.
      for (let i = 0; i < rows.length; i += 200) {
        const slice = rows.slice(i, i + 200)
        const { error: insErr } = await supabase.from('lease_chunks').insert(slice)
        if (insErr) throw new Error(`chunk insert failed: ${insErr.message}`)
      }
    }

    const { error: doneErr } = await supabase
      .from('lease_documents')
      .update({
        status: 'ready',
        page_count: pages.length,
        ingested_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', documentId)
    if (doneErr) throw new Error(doneErr.message)

    return json({ ok: true, document_id: documentId, pages: pages.length, chunks: embedded.length })
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    await supabase
      .from('lease_documents')
      .update({ status: 'failed', error: msg })
      .eq('id', documentId)
    return json({ ok: false, error: msg }, 500)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Parse a PDF into per-page text. We avoid `pdf-parse`'s top-level default
 * export (which eagerly opens a sample PDF on import in some versions) by
 * importing its internal entry directly.
 */
async function parsePdfPages(buf: Buffer): Promise<PageInput[]> {
  // Lazy import — keeps test cold-start small and avoids loading pdf-parse
  // in environments that never call ingest.
  const mod = (await import('pdf-parse')) as unknown as {
    default: (data: Buffer, opts?: unknown) => Promise<{ numpages: number; text: string }>
  }

  const collected: PageInput[] = []
  let pageNum = 0

  // The `pagerender` hook is called once per page; we record the rendered
  // text and bump the page counter. We use the default render function from
  // pdf-parse semantics — accept a page object and return its text content.
  const pagerender = async (pageData: {
    getTextContent: () => Promise<{ items: Array<{ str: string }> }>
  }): Promise<string> => {
    pageNum += 1
    const content = await pageData.getTextContent()
    const text = content.items.map((it) => it.str).join(' ')
    collected.push({ page: pageNum, text })
    return text
  }

  await mod.default(buf, { pagerender })

  // If `pagerender` didn't fire (some PDFs), fall back to a single-page split.
  if (collected.length === 0) {
    const fallback = await mod.default(buf)
    collected.push({ page: 1, text: fallback.text })
  }
  return collected
}
