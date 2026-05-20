// Unit tests for apps/web/src/lib/logger.ts (added in P0).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { logger, makeLogger } from '../src/lib/logger'

function parseLast(spy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const calls = spy.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  const lastCall = calls[calls.length - 1]!
  return JSON.parse(lastCall[0] as string)
}

describe('logger: JSON output format', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes one JSON line per .info() call to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    logger.info('hello', { user: 'alice' })
    const payload = parseLast(spy)
    expect(payload.level).toBe('info')
    expect(payload.msg).toBe('hello')
    expect(payload.user).toBe('alice')
    expect(typeof payload.ts).toBe('string')
  })

  it('writes to console.warn at warn level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    logger.warn('something off')
    const payload = parseLast(spy)
    expect(payload.level).toBe('warn')
    expect(payload.msg).toBe('something off')
  })

  it('writes to console.error at error level', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logger.error('boom')
    const payload = parseLast(spy)
    expect(payload.level).toBe('error')
    expect(payload.msg).toBe('boom')
  })
})

describe('makeLogger / .with(): context merging', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('a child logger includes parent context', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const child = makeLogger({ request_id: 'req_42' })
    child.info('handled')
    const payload = parseLast(spy)
    expect(payload.request_id).toBe('req_42')
    expect(payload.msg).toBe('handled')
  })

  it('child .with() merges its context onto the parent', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const child = makeLogger({ a: 1 }).with({ b: 2 })
    child.info('m')
    const payload = parseLast(spy)
    expect(payload).toMatchObject({ a: 1, b: 2, msg: 'm' })
  })

  it('per-call context overrides .with() context for the same key', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    makeLogger({ user: 'alice' }).info('m', { user: 'bob' })
    const payload = parseLast(spy)
    expect(payload.user).toBe('bob')
  })
})

describe('logger: error serialization', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('serializes Error into { name, message, stack } under `error`', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const err = new Error('kaboom')
    logger.error('something failed', err)
    const payload = parseLast(spy)
    const e = payload.error as { name: string; message: string; stack?: string }
    expect(e.message).toBe('kaboom')
    expect(e.name).toBe('Error')
    expect(typeof e.stack).toBe('string')
  })

  it('passes non-Error values through unchanged', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logger.error('failed', { code: 42 })
    const payload = parseLast(spy)
    expect(payload.error).toEqual({ code: 42 })
  })
})
