import { describe, expect, it, vi } from 'vitest'
import { z } from '@ar/shared'
import type { APIContext, APIRoute } from 'astro'
import { apiHandler, ok } from '../src/lib/api-handler'

const Schema = z.object({
  name: z.string().min(1),
  age: z.number().int().nonnegative(),
})

function makeCtx(
  body: string | undefined,
  overrides: Partial<APIContext> = {},
): APIContext {
  const request = body === undefined
    ? new Request('https://example.com/api/test', { method: 'POST' })
    : new Request('https://example.com/api/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
  const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
  return {
    request,
    locals: { log },
    cookies: {} as APIContext['cookies'],
    ...overrides,
  } as unknown as APIContext
}

async function runRoute(route: APIRoute, ctx: APIContext): Promise<Response> {
  const res = await route(ctx as never)
  if (!res) throw new Error('Route returned no Response')
  return res
}

describe('apiHandler', () => {
  it('invokes the handler with parsed data on valid input', async () => {
    const handler = vi.fn((data: z.infer<typeof Schema>) =>
      ok({ ok: true, received: data }),
    )
    const route = apiHandler(Schema, handler)
    const ctx = makeCtx(JSON.stringify({ name: 'Ada', age: 36 }))

    const res = await runRoute(route, ctx)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    const body = await res.json()
    expect(body).toEqual({ ok: true, received: { name: 'Ada', age: 36 } })
    expect(handler).toHaveBeenCalledTimes(1)
    const firstCall = handler.mock.calls[0] as unknown as [unknown, APIContext]
    expect(firstCall[0]).toEqual({ name: 'Ada', age: 36 })
    // Second argument should be the APIContext
    expect(firstCall[1]).toBe(ctx)
  })

  it('returns 400 + INVALID_JSON when the body is not parseable JSON', async () => {
    const handler = vi.fn(() => ok({ ok: true }))
    const route = apiHandler(Schema, handler)
    const ctx = makeCtx('not-json{')

    const res = await runRoute(route, ctx)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({
      ok: false,
      error: 'Invalid JSON body',
      code: 'INVALID_JSON',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 400 + VALIDATION_ERROR with Zod issues on schema mismatch', async () => {
    const handler = vi.fn(() => ok({ ok: true }))
    const route = apiHandler(Schema, handler)
    const ctx = makeCtx(JSON.stringify({ name: '', age: -1 }))

    const res = await runRoute(route, ctx)

    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      ok: boolean
      error: string
      code: string
      issues: Array<{ path: (string | number)[]; message: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.error).toBe('Invalid request')
    expect(Array.isArray(body.issues)).toBe(true)
    expect(body.issues.length).toBeGreaterThan(0)
    const paths = body.issues.map((i) => i.path.join('.'))
    expect(paths).toContain('name')
    expect(paths).toContain('age')
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns 500 + INTERNAL_ERROR and calls locals.log.error when the handler throws', async () => {
    const handler = vi.fn(() => {
      throw new Error('boom')
    })
    const route = apiHandler(Schema, handler)
    const ctx = makeCtx(JSON.stringify({ name: 'Ada', age: 36 }))

    const res = await runRoute(route, ctx)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({
      ok: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
    const log = (ctx.locals as { log: { error: ReturnType<typeof vi.fn> } }).log
    expect(log.error).toHaveBeenCalledTimes(1)
    const [msg, meta] = log.error.mock.calls[0] as [string, Record<string, unknown>]
    expect(msg).toBe('api_handler_unhandled_error')
    expect(meta.message).toBe('boom')
    expect(typeof meta.stack === 'string' || meta.stack === undefined).toBe(true)
  })

  it('accepts schema = null and skips body parsing for body-less endpoints', async () => {
    const handler = vi.fn(() => ok({ ok: true, pinged: true }))
    const route = apiHandler(null, handler)
    const ctx = makeCtx(undefined)

    const res = await runRoute(route, ctx)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, pinged: true })
    expect(handler).toHaveBeenCalledTimes(1)
    const firstCall = handler.mock.calls[0] as unknown as [unknown, APIContext]
    expect(firstCall[0]).toBeUndefined()
  })

  it('falls back to console.error when locals.log is missing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = vi.fn(() => {
      throw new Error('no logger here')
    })
    const route = apiHandler(Schema, handler)
    const ctx = makeCtx(JSON.stringify({ name: 'Ada', age: 36 }), {
      locals: {} as APIContext['locals'],
    })

    const res = await runRoute(route, ctx)

    expect(res.status).toBe(500)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
