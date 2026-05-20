import { useEffect, useState } from 'react'

// Reads the maintenance-form queue (managed by the bespoke service worker —
// see public/sw-extra.ts) via a postMessage round-trip and shows a small badge
// when the device is offline or there are pending items.
//
// Falls back gracefully when SW isn't available (dev without HTTPS, etc).

const QUEUE_REQUEST = 'ar:queue-status'
const QUEUE_RESPONSE = 'ar:queue-status-response'

interface QueueStatus {
  count: number
}

async function fetchQueueStatus(): Promise<QueueStatus> {
  if (!('serviceWorker' in navigator)) return { count: 0 }
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null)
  if (!reg?.active) return { count: 0 }
  return new Promise<QueueStatus>((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve({ count: 0 }), 500)
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer)
      const data = event.data as { type?: string; count?: number } | undefined
      if (data?.type === QUEUE_RESPONSE) {
        resolve({ count: data.count ?? 0 })
      } else {
        resolve({ count: 0 })
      }
    }
    reg.active!.postMessage({ type: QUEUE_REQUEST }, [channel.port2])
  })
}

export function OfflineQueueIndicator() {
  const [online, setOnline] = useState(true)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setOnline(navigator.onLine)

    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)

    let cancelled = false
    const refresh = () => {
      fetchQueueStatus().then((s) => {
        if (!cancelled) setCount(s.count)
      }).catch(() => {})
    }
    refresh()
    const id = window.setInterval(refresh, 5000)

    return () => {
      cancelled = true
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.clearInterval(id)
    }
  }, [])

  if (online && count === 0) return null

  const label = !online && count === 0
    ? "You're offline"
    : count === 1
      ? '1 maintenance request queued'
      : `${count} maintenance requests queued`

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 right-4 z-40 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300 shadow"
    >
      <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true"></span>
      {label}
    </div>
  )
}

export default OfflineQueueIndicator
