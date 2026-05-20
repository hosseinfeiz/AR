/// <reference lib="webworker" />
//
// Bespoke service-worker logic for the maintenance-form offline queue.
// The PWA plugin (@vite-pwa/astro / Workbox) handles app-shell precaching and
// runtime caching for static assets. This file adds:
//
//   1. An IndexedDB-backed queue for failed POSTs to /api/maintenance.
//   2. A Background Sync (`sync` event tag: `ar-maintenance-queue`) that
//      retries queued requests when connectivity returns. Browsers without
//      the Background Sync API fall back to an `online` event listener.
//   3. A postMessage channel so UI islands can read queue depth (used by
//      OfflineQueueIndicator).
//   4. A `push` event handler (when VAPID is configured server-side) that
//      shows the payload as a Notification.
//
// This file is intentionally written so it can be `importScripts(...)`-ed by
// the Workbox-generated SW, or registered standalone in dev. It's authored as
// TypeScript so the editor checks types; the build copies it through Astro's
// public/ pipeline (no compilation) — keep it syntactically ES2020 + plain
// service-worker globals. Avoid bare specifiers.
//
// NOTE: at runtime browsers see `.ts`. We expose the JS twin (sw-extra.js)
// via the runbook for production registration if Workbox doesn't pull this in.

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference lib="WebWorker" />

export {}
declare const self: ServiceWorkerGlobalScope & {
  registration: ServiceWorkerRegistration & {
    sync?: { register(tag: string): Promise<void> }
  }
}

const DB_NAME = 'ar-pwa'
const DB_VERSION = 1
const STORE = 'maintenance-queue'
const SYNC_TAG = 'ar-maintenance-queue'

interface QueuedRequest {
  id?: number
  url: string
  body: string
  timestamp: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | T): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const store = t.objectStore(STORE)
    const result = fn(store)
    if (result instanceof IDBRequest) {
      result.onsuccess = () => resolve(result.result as T)
      result.onerror = () => reject(result.error)
    } else {
      t.oncomplete = () => resolve(result as T)
      t.onerror = () => reject(t.error)
    }
  })
}

async function enqueue(item: QueuedRequest): Promise<void> {
  await tx('readwrite', (s) => s.add(item))
}

async function listAll(): Promise<QueuedRequest[]> {
  return tx('readonly', (s) => s.getAll() as IDBRequest<QueuedRequest[]>)
}

async function remove(id: number): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

async function count(): Promise<number> {
  return tx('readonly', (s) => s.count() as IDBRequest<number>)
}

async function flush(): Promise<void> {
  const items = await listAll()
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: item.body,
      })
      if (res.ok && item.id != null) await remove(item.id)
    } catch {
      // still offline / server down — leave queued for next attempt
      return
    }
  }
}

self.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'POST' || url.pathname !== '/api/maintenance') return

  event.respondWith(
    (async () => {
      const cloned = req.clone()
      try {
        return await fetch(req)
      } catch {
        const body = await cloned.text()
        await enqueue({ url: req.url, body, timestamp: Date.now() })
        try {
          await self.registration.sync?.register(SYNC_TAG)
        } catch {
          /* no-op: browser lacks Background Sync */
        }
        return new Response(
          JSON.stringify({ queued: true, ref_id: 'OFFLINE-' + Date.now().toString(36) }),
          { status: 202, headers: { 'content-type': 'application/json' } },
        )
      }
    })(),
  )
})

// `sync` is not in the standard ServiceWorkerGlobalScopeEventMap typing yet —
// cast to a permissive signature.
;(self.addEventListener as (
  type: string,
  listener: (event: { tag?: string; waitUntil(p: Promise<unknown>): void }) => void,
) => void)('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flush())
  }
})

// Fallback for browsers without Background Sync.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | undefined
  if (data?.type === 'ar:queue-status') {
    count().then((n) => {
      event.ports[0]?.postMessage({ type: 'ar:queue-status-response', count: n })
    }).catch(() => {
      event.ports[0]?.postMessage({ type: 'ar:queue-status-response', count: 0 })
    })
  } else if (data?.type === 'ar:queue-flush') {
    flush().catch(() => {})
  }
})

self.addEventListener('online' as keyof ServiceWorkerGlobalScopeEventMap, () => {
  flush().catch(() => {})
})

// Web Push handler.
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return
  let payload: { title?: string; body?: string; url?: string; tag?: string }
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'AR Management', body: event.data.text() }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'AR Management', {
      body: payload.body ?? '',
      tag: payload.tag,
      data: { url: payload.url ?? '/portal' },
      icon: '/icons/icon-256.png',
      badge: '/icons/icon-256.png',
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | null)?.url ?? '/portal'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c && c.url.endsWith(target)) return c.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
