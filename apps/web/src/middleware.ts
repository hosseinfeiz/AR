import { defineMiddleware } from 'astro:middleware'
import { logger } from './lib/logger'

// Attach a request_id to every response and to `locals.log` so handlers can
// log with that ID baked in. Honors an upstream X-Request-Id (e.g. from a CDN)
// when present, otherwise mints a UUID.
export const onRequest = defineMiddleware(async (ctx, next) => {
  const incoming = ctx.request.headers.get('x-request-id')
  const requestId = incoming && incoming.length <= 64 ? incoming : crypto.randomUUID()

  const log = logger.with({
    request_id: requestId,
    path: new URL(ctx.request.url).pathname,
    method: ctx.request.method,
  })
  ctx.locals.requestId = requestId
  ctx.locals.log = log

  const started = Date.now()
  try {
    const res = await next()
    res.headers.set('x-request-id', requestId)
    log.info('request', { status: res.status, duration_ms: Date.now() - started })
    return res
  } catch (err) {
    log.error('request failed', err, { duration_ms: Date.now() - started })
    throw err
  }
})
