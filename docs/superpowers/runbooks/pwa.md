# PWA + Offline Queue + Web Push — Runbook

Owner: web platform (S9, 2026-05-20).

## What's in scope

- Installable PWA on `apps/web` (manifest + service worker via
  `@vite-pwa/astro`).
- Install prompt on portal routes (with iOS fallback).
- Offline queue for the maintenance form (Background Sync where supported,
  online-event fallback elsewhere).
- Web Push: server-side delivery helper + tenant subscribe/unsubscribe.
- `apps/lynx` retired (see `apps/lynx/ARCHIVED.md`).

## Architecture

```
Browser
  │
  ├─ /manifest.webmanifest        (public/manifest.webmanifest)
  ├─ /sw.js (Workbox-generated)   ──> precaches app shell, runtime caches
  │                                   marketing pages + images. Skips /api,
  │                                   /portal, /admin.
  ├─ /sw-extra.ts                 ──> bespoke: offline queue, push events,
  │                                   queue-status postMessage channel.
  └─ Islands:
      InstallPrompt, PushOptInButton, OfflineQueueIndicator

Server (Astro endpoints)
  POST /api/portal/push-subscribe      writes push_subscriptions
  POST /api/portal/push-unsubscribe    deletes from push_subscriptions
  src/lib/push.ts   deliverToTenant({admin, tenantId, payload})

Database
  push_subscriptions (id, tenant_id, endpoint UNIQUE, p256dh, auth_token,
  created_at)  -- managers read; writes via service role only.
```

## Setup

### 1. Install deps

```sh
pnpm install --prefer-offline
```

Note: `apps/lynx` is no longer in `pnpm-workspace.yaml`, so its dependency tree
is skipped.

### 2. Generate VAPID keys

```sh
npx web-push generate-vapid-keys
```

Copy the values into `.env`:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:ops@ar-management.example
PUBLIC_VAPID_PUBLIC_KEY=...   # mirror of VAPID_PUBLIC_KEY for the browser
```

Rotate keys by re-running the generator and clearing the
`push_subscriptions` table (all subscriptions become invalid the moment the
public key changes).

### 3. Apply the migration

```sh
supabase db push   # or supabase migration up
```

This creates `public.push_subscriptions` with RLS that allows authenticated
managers to read; writes happen via the service-role API path.

### 4. Build / verify

```sh
pnpm --filter @ar/web typecheck
pnpm --filter @ar/web test
pnpm --filter @ar/web build
```

After build, confirm:

- `apps/web/dist/client/sw.js` exists (Workbox-generated SW).
- `apps/web/dist/client/manifest.webmanifest` exists.
- `apps/web/dist/client/icons/icon-{256,512}.png` exist.

## Icons

Placeholder PNG icons live at `apps/web/public/icons/`:

- `icon-256.png`
- `icon-512.png`
- `icon-512-maskable.png` (extra safe-area padding for Android adaptive icons)

To regenerate from the brand color (`#0a58ca`) with crude "AR" text:

```sh
node scripts/gen-pwa-icons.mjs apps/web/public/icons
```

The script that generated these placeholders is a small Node program (no
deps) that hand-encodes a PNG with a solid brand-color square and a 7-pixel
bitmap for "AR" — see this runbook's appendix for the source. Production
should swap these for a designer-supplied set with proper kerning.

## Cache safety contract

The Workbox configuration in `astro.config.mjs` MUST exclude private routes:

- `navigateFallbackDenylist: [/^\/api\//, /^\/portal\//, /^\/admin\//]`
- Runtime caching predicates skip any path under those prefixes.

If you add a new authenticated route prefix, add it to both denylists.

## Offline queue (maintenance form)

`public/sw-extra.ts` intercepts `POST /api/maintenance`. When the network
fetch fails it:

1. Reads the request body and writes a record to IndexedDB
   (`ar-pwa` → `maintenance-queue`).
2. Tries to register a Background Sync (`ar-maintenance-queue`).
3. Returns a synthetic 202 response with `queued: true`.

When the SW receives a `sync` event with that tag (or an `online` event in
fallback) it replays each request and removes successful entries.

The `OfflineQueueIndicator` island queries the queue depth via postMessage.

### Limitations

- The Background Sync API is not available on iOS Safari. iOS falls back to
  retry-on-`online`; the user must keep the tab open until the device
  reconnects. Document this in the user-facing copy when rolling out.
- Photo uploads happen out-of-band and are not currently queued. If the user
  is offline they'll see an upload error and the form will queue without
  attachments.

## Push notifications

### Subscribe (browser)

`PushOptInButton` calls `Notification.requestPermission()`, then
`registration.pushManager.subscribe({ userVisibleOnly: true,
applicationServerKey })`. The resulting `PushSubscription.toJSON()` is POSTed
to `/api/portal/push-subscribe`.

### Deliver (server)

```ts
import { getAdminClient } from '@/lib/supabase-admin'
import { deliverToTenant } from '@/lib/push'

await deliverToTenant({
  admin: getAdminClient(),
  tenantId: session.tenantId,
  payload: {
    title: 'Maintenance update',
    body: 'Your request is now in progress.',
    url: '/portal/maintenance',
    tag: 'maintenance:abc123',
  },
})
```

The helper:
- Lazily loads `web-push` and configures VAPID once per process.
- Iterates subscriptions serially (push services rate-limit per endpoint).
- Returns per-subscription results; dead endpoints (404/410) are deleted
  before return.

Full delivery wiring (which feature triggers which push) is post-MVP.

### Unsubscribe

`PushOptInButton` calls the inverse endpoint and then
`PushSubscription.unsubscribe()`.

## Verifying in the browser

1. `pnpm --filter @ar/web build && pnpm --filter @ar/web preview`
2. Open Chrome DevTools → Application:
   - **Manifest** tab shows name, icons, theme color.
   - **Service Workers** shows `sw.js` activated.
   - **Storage** shows IndexedDB `ar-pwa/maintenance-queue` (empty until you
     submit while offline).
3. Toggle **Offline** in the Network panel and submit a maintenance request;
   verify the OfflineQueueIndicator appears and a row lands in IndexedDB.
4. Toggle back online → the sync replays and the indicator clears.

## Lynx archival

`apps/lynx/` was removed from the pnpm workspace list. To re-enable for
reference:

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/web"
  - "apps/lynx"
  - "packages/*"
```

Then `pnpm install` from the root. See `apps/lynx/ARCHIVED.md` for the full
note and deletion procedure.

## Appendix: regenerate placeholder icons

```js
// scripts/gen-pwa-icons.mjs (not yet committed — paste this if needed)
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'
const BRAND = [0x0a,0x58,0xca], WHITE=[0xff,0xff,0xff]
const A = ['0011100','0110110','1100011','1111111','1100011','1100011','1100011']
const R = ['1111110','1100011','1100011','1111110','1101000','1100110','1100011']
function crc32(buf){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}
  let crc=0xffffffff;for(const b of buf)crc=(t[(crc^b)&0xff]^(crc>>>8))>>>0;return(crc^0xffffffff)>>>0}
function ch(type,data){const l=Buffer.alloc(4);l.writeUInt32BE(data.length,0);const tb=Buffer.from(type);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([tb,data])),0);return Buffer.concat([l,tb,data,c])}
function png(size,mask=false){const pad=Math.floor(size*(mask?.18:.08)),inner=size-pad*2,gw=Math.floor(inner*.4),gap=Math.floor(inner*.1),tw=gw*2+gap,xs=pad+Math.floor((inner-tw)/2),ys=pad+Math.floor((inner-gw)/2),sc=gw/7
  const row=size*3+1,raw=Buffer.alloc(row*size)
  for(let y=0;y<size;y++){raw[y*row]=0;for(let x=0;x<size;x++){const i=y*row+1+x*3;raw[i]=BRAND[0];raw[i+1]=BRAND[1];raw[i+2]=BRAND[2]}}
  const draw=(g,ox,oy)=>{for(let gy=0;gy<7;gy++)for(let gx=0;gx<7;gx++)if(g[gy][gx]==='1'){const px=ox+Math.floor(gx*sc),py=oy+Math.floor(gy*sc),w=Math.ceil(sc),h=Math.ceil(sc)
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const X=px+xx,Y=py+yy;if(X<size&&Y<size){const i=Y*row+1+X*3;raw[i]=WHITE[0];raw[i+1]=WHITE[1];raw[i+2]=WHITE[2]}}}}
  draw(A,xs,ys); draw(R,xs+gw+gap,ys)
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=2
  const idat=zlib.deflateSync(raw),sig=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])
  return Buffer.concat([sig,ch('IHDR',ihdr),ch('IDAT',idat),ch('IEND',Buffer.alloc(0))])}
const OUT=process.argv[2]||'apps/web/public/icons'; fs.mkdirSync(OUT,{recursive:true})
fs.writeFileSync(path.join(OUT,'icon-256.png'),png(256))
fs.writeFileSync(path.join(OUT,'icon-512.png'),png(512))
fs.writeFileSync(path.join(OUT,'icon-512-maskable.png'),png(512,true))
```
