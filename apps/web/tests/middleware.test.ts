// Unit tests for apps/web/src/middleware.ts (request-id middleware from P0).
import { describe, expect, it, vi, beforeEach } from 'vitest'

// `astro:middleware` is a virtual module that only resolves inside Astro's
// runtime. For tests, stub `defineMiddleware` as identity so the module loads.
vi.mock('astro:middleware', () => ({
  defineMiddleware: <T>(fn: T) => fn,
}))

const { onRequest } = await import('../src/middleware')

function makeCtx(headers: Record<string, string> = {}) {
  return {
    request: new Request('https://example.com/test', { method: 'GET', headers }),
    locals: {} as Record<string, unknown>,
  }
}

const okNext = async () => new Response('ok', { status: 200 })

describe('middleware: request id', () => {
  beforeEach(() => vi.restoreAllMocks())
  // Silence the structured log line the middleware writes — we only care
  // about headers + locals here.
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined))

  it('mints a new UUID when no X-Request-Id header is present', async () => {
    const ctx = makeCtx()
    const res = (await onRequest(ctx as unknown as Parameters<typeof onRequest>[0], okNext)) as Response
    const id = res.headers.get('x-request-id')
    expect(id).toBeTruthy()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(ctx.locals.requestId).toBe(id)
  })

  it('honours an incoming X-Request-Id when reasonable', async () => {
    const incoming = 'cdn-abc-123'
    const ctx = makeCtx({ 'x-request-id': incoming })
    const res = (await onRequest(ctx as unknown as Parameters<typeof onRequest>[0], okNext)) as Response
    expect(res.headers.get('x-request-id')).toBe(incoming)
    expect(ctx.locals.requestId).toBe(incoming)
  })

  it('ignores an incoming X-Request-Id that is unreasonably long', async () => {
    const incoming = 'x'.repeat(200)
    const ctx = makeCtx({ 'x-request-id': incoming })
    const res = (await onRequest(ctx as unknown as Parameters<typeof onRequest>[0], okNext)) as Response
    const id = res.headers.get('x-request-id')
    expect(id).not.toBe(incoming)
    expect(id).toBeTruthy()
  })

  it('attaches a usable logger on locals.log', async () => {
    const ctx = makeCtx()
    await onRequest(ctx as unknown as Parameters<typeof onRequest>[0], okNext)
    const log = ctx.locals.log as { info: (msg: string) => void } | undefined
    expect(typeof log?.info).toBe('function')
  })

  it('propagates exceptions from the downstream handler', async () => {
    const ctx = makeCtx()
    const boom = async () => {
      throw new Error('downstream blew up')
    }
    await expect(
      onRequest(ctx as unknown as Parameters<typeof onRequest>[0], boom),
    ).rejects.toThrow('downstream blew up')
  })
})
