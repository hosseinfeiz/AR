import { useEffect, useState } from 'react'

// Requests Notification permission, subscribes via the service worker's
// PushManager, and POSTs the subscription to /api/portal/push-subscribe.
// Unsubscribe calls the inverse endpoint. Requires the PWA service worker to
// be registered (handled by @vite-pwa/astro auto-registration).

interface Props {
  vapidPublicKey: string
}

type State = 'idle' | 'unsupported' | 'denied' | 'subscribed' | 'working' | 'error'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buf = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export function PushOptInButton({ vapidPublicKey }: Props) {
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    currentSubscription().then((sub) => {
      if (sub) setState('subscribed')
    }).catch(() => {})
  }, [])

  async function subscribe() {
    setState('working')
    setMessage(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle')
        return
      }
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      }
      const res = await fetch('/api/portal/push-subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? `Server returned ${res.status}`)
      }
      setState('subscribed')
    } catch (e) {
      setState('error')
      setMessage((e as Error).message)
    }
  }

  async function unsubscribe() {
    setState('working')
    setMessage(null)
    try {
      const sub = await currentSubscription()
      if (sub) {
        await fetch('/api/portal/push-unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('idle')
    } catch (e) {
      setState('error')
      setMessage((e as Error).message)
    }
  }

  if (state === 'unsupported') {
    return <p className="text-sm text-gray-500">Push notifications are not supported in this browser.</p>
  }
  if (state === 'denied') {
    return (
      <p className="text-sm text-gray-500">
        Notifications are blocked. Enable them in your browser settings to receive status updates.
      </p>
    )
  }

  const baseBtn =
    'inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50'

  if (state === 'subscribed') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-green-700">Notifications on</span>
        <button
          type="button"
          onClick={unsubscribe}
          className={`${baseBtn} text-gray-700 border border-gray-300 hover:bg-gray-50`}
        >
          Turn off
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        disabled={state === 'working'}
        onClick={subscribe}
        className={`${baseBtn} text-white bg-[var(--color-brand)] hover:bg-[var(--color-brand-dark)]`}
      >
        {state === 'working' ? 'Working…' : 'Turn on notifications'}
      </button>
      {state === 'error' && message && (
        <p className="text-xs text-red-600 mt-1">{message}</p>
      )}
    </div>
  )
}

export default PushOptInButton
