import { useRef, useState } from 'react'

interface Citation {
  page: number | null
  chunk_index: number
  snippet: string
}

interface Props {
  /** Suggested questions to populate the textarea on first load. */
  suggestions?: string[]
}

const DEFAULT_SUGGESTIONS = [
  'When is my rent due each month?',
  'Can I sublet my apartment?',
  'What are the rules for breaking my lease early?',
  'Am I responsible for pest control?',
]

export function LeaseQa({ suggestions = DEFAULT_SUGGESTIONS }: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function handleAsk(e?: React.FormEvent) {
    if (e) e.preventDefault()
    const q = question.trim()
    if (!q || loading) return

    setLoading(true)
    setError(null)
    setAnswer('')
    setCitations([])

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const res = await fetch('/api/portal/lease-qa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q }),
        signal: ac.signal,
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }

      // Non-streaming fallback (e.g. no ingested lease).
      const ct = res.headers.get('content-type') ?? ''
      if (!ct.includes('text/event-stream')) {
        const data = (await res.json()) as {
          ok: boolean
          answer?: string
          citations?: Citation[]
          error?: string
        }
        if (!data.ok) throw new Error(data.error ?? 'Unknown error')
        setAnswer(data.answer ?? '')
        setCitations(data.citations ?? [])
        return
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // Split on the SSE record terminator.
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx).trim()
          buf = buf.slice(idx + 2)
          if (!frame.startsWith('data:')) continue
          const json = frame.slice(5).trim()
          if (!json) continue
          let evt: { type: string; [k: string]: unknown }
          try {
            evt = JSON.parse(json) as { type: string; [k: string]: unknown }
          } catch {
            continue
          }
          if (evt.type === 'citations') {
            setCitations((evt.citations as Citation[]) ?? [])
          } else if (evt.type === 'delta') {
            const t = evt.text as string
            if (t) setAnswer((prev) => prev + t)
          } else if (evt.type === 'error') {
            throw new Error((evt.error as string) ?? 'stream error')
          } else if (evt.type === 'done') {
            // Server confirmed end; reader.read() will close soon.
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError((err as Error).message ?? 'Unknown error')
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  function pickSuggestion(s: string) {
    setQuestion(s)
  }

  function openCitation(c: Citation) {
    // Best-effort: ask the server for a signed URL to the lease PDF and open
    // it at the cited page. The server-side handler is wired through the
    // ingest endpoint's bucket; if it isn't set up yet, we silently no-op
    // so the UI doesn't break.
    if (c.page == null) return
    fetch('/api/portal/lease-qa?signed=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ page: c.page }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { url?: string }) => {
        if (data?.url) window.open(`${data.url}#page=${c.page}`, '_blank', 'noopener')
      })
      .catch(() => {
        /* no-op */
      })
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleAsk} className="space-y-3">
        <label htmlFor="lease-qa-q" className="block text-sm font-medium text-gray-700">
          Ask a question about your lease
        </label>
        <textarea
          id="lease-qa-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="When is my rent due?"
          rows={3}
          maxLength={1000}
          disabled={loading}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] disabled:bg-gray-50"
        />
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSuggestion(s)}
              disabled={loading}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="inline-flex items-center rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-dark)] disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {(answer || loading) && (
        <div className="rounded-xl border border-gray-200 p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Answer
          </h3>
          <p className="whitespace-pre-wrap text-sm text-gray-900">
            {answer}
            {loading && <span className="ml-1 inline-block animate-pulse">▍</span>}
          </p>
          {citations.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Cited from your lease
              </h4>
              <div className="flex flex-wrap gap-2">
                {citations.map((c) => (
                  <button
                    key={`${c.chunk_index}-${c.page}`}
                    type="button"
                    title={c.snippet}
                    onClick={() => openCitation(c)}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-800 hover:bg-gray-100"
                  >
                    <span className="font-medium">Page {c.page ?? '?'}</span>
                    <span className="max-w-[14rem] truncate text-gray-500">{c.snippet}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default LeaseQa
