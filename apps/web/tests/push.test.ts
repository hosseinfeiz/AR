import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deliverToTenant,
  isPushConfigured,
  sendOne,
  setWebPushImpl,
  type DeliveryResult,
  type PushSubscriptionRecord,
} from '../src/lib/push'

interface MockWebPush {
  setVapidDetails: ReturnType<typeof vi.fn>
  sendNotification: ReturnType<typeof vi.fn>
}

function mockWebPush(): MockWebPush {
  return {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  }
}

// vitest's Mock<...> generic type isn't structurally a plain function, so
// `setWebPushImpl` rejects it without an `unknown` step.
function installMock(impl: MockWebPush): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setWebPushImpl(impl as unknown as any)
}

function makeSub(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    id: 'sub-1',
    tenant_id: 't-1',
    endpoint: 'https://push.example/1',
    p256dh: 'p256-1',
    auth_token: 'auth-1',
    ...overrides,
  }
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.VAPID_SUBJECT = 'mailto:test@example.com'
  process.env.VAPID_PUBLIC_KEY = 'BPublic-test-key-aaaaaaaaaaaaa'
  process.env.VAPID_PRIVATE_KEY = 'BPrivate-test-key-bbbbbbbbbbbb'
})

afterEach(() => {
  setWebPushImpl(null)
  for (const k of ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'] as const) {
    const v = ORIGINAL_ENV[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('isPushConfigured', () => {
  it('is true when VAPID env is present', () => {
    expect(isPushConfigured()).toBe(true)
  })
  it('is false when any VAPID var is missing', () => {
    delete process.env.VAPID_PRIVATE_KEY
    expect(isPushConfigured()).toBe(false)
  })
})

describe('sendOne', () => {
  it('configures VAPID once and delivers', async () => {
    const impl = mockWebPush()
    impl.sendNotification.mockResolvedValue({ statusCode: 201 })
    installMock(impl)

    const r1 = await sendOne(makeSub(), { title: 'hello', body: 'world' })
    const r2 = await sendOne(makeSub({ id: 'sub-2', endpoint: 'https://push.example/2' }), { title: 'hello', body: 'world' })

    expect(r1.ok).toBe(true)
    expect(r1.statusCode).toBe(201)
    expect(r2.ok).toBe(true)
    expect(impl.setVapidDetails).toHaveBeenCalledTimes(1)
    expect(impl.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@example.com',
      expect.any(String),
      expect.any(String),
    )
    expect(impl.sendNotification).toHaveBeenCalledTimes(2)
    const firstCall = impl.sendNotification.mock.calls[0]!
    const [sub, payload] = firstCall
    expect(sub).toEqual({ endpoint: 'https://push.example/1', keys: { p256dh: 'p256-1', auth: 'auth-1' } })
    expect(JSON.parse(payload as string)).toEqual({ title: 'hello', body: 'world' })
  })

  it('flags gone subscriptions on 410', async () => {
    const impl = mockWebPush()
    impl.sendNotification.mockRejectedValue({ statusCode: 410, body: 'gone' })
    installMock(impl)

    const r = await sendOne(makeSub(), { title: 't', body: 'b' })
    expect(r.ok).toBe(false)
    expect(r.gone).toBe(true)
    expect(r.statusCode).toBe(410)
  })

  it('flags gone subscriptions on 404', async () => {
    const impl = mockWebPush()
    impl.sendNotification.mockRejectedValue({ statusCode: 404, body: 'nope' })
    installMock(impl)

    const r = await sendOne(makeSub(), { title: 't', body: 'b' })
    expect(r.gone).toBe(true)
  })

  it('reports transient errors without marking gone', async () => {
    const impl = mockWebPush()
    impl.sendNotification.mockRejectedValue({ statusCode: 500, message: 'boom' })
    installMock(impl)

    const r = await sendOne(makeSub(), { title: 't', body: 'b' })
    expect(r.ok).toBe(false)
    expect(r.gone).toBeFalsy()
    expect(r.error).toBe('boom')
  })

  it('refuses to send when VAPID is not configured', async () => {
    delete process.env.VAPID_PUBLIC_KEY
    const impl = mockWebPush()
    installMock(impl)

    const r = await sendOne(makeSub(), { title: 't', body: 'b' })
    expect(r.ok).toBe(false)
    expect(impl.sendNotification).not.toHaveBeenCalled()
    expect(r.error).toMatch(/VAPID/)
  })
})

interface MockAdmin {
  from: ReturnType<typeof vi.fn>
  _select: ReturnType<typeof vi.fn>
  _delete: ReturnType<typeof vi.fn>
}

function makeAdminClient(rows: PushSubscriptionRecord[]): MockAdmin {
  const deleteIn = vi.fn().mockResolvedValue({ error: null })
  const _delete = vi.fn(() => ({ in: deleteIn }))
  const _select = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
  }))
  const from = vi.fn(() => ({
    select: _select,
    delete: _delete,
  }))
  return { from, _select, _delete } as MockAdmin
}

describe('deliverToTenant', () => {
  it('sends to every subscription and prunes dead ones', async () => {
    const impl = mockWebPush()
    impl.sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })          // sub-1 ok
      .mockRejectedValueOnce({ statusCode: 410, body: '' }) // sub-2 gone
      .mockResolvedValueOnce({ statusCode: 201 })          // sub-3 ok
    installMock(impl)

    const rows: PushSubscriptionRecord[] = [
      makeSub({ id: 's1', endpoint: 'https://push.example/1' }),
      makeSub({ id: 's2', endpoint: 'https://push.example/2' }),
      makeSub({ id: 's3', endpoint: 'https://push.example/3' }),
    ]
    const admin = makeAdminClient(rows)

    const results: DeliveryResult[] = await deliverToTenant({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      tenantId: 't-1',
      payload: { title: 'hi', body: 'b' },
    })

    expect(results).toHaveLength(3)
    expect(results[0]!.ok).toBe(true)
    expect(results[1]!.gone).toBe(true)
    expect(results[2]!.ok).toBe(true)
    expect(admin._delete).toHaveBeenCalledTimes(1)
  })

  it('returns empty array when no subscriptions exist', async () => {
    const impl = mockWebPush()
    installMock(impl)
    const admin = makeAdminClient([])
    const results = await deliverToTenant({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      tenantId: 't-1',
      payload: { title: 'hi', body: 'b' },
    })
    expect(results).toEqual([])
    expect(impl.sendNotification).not.toHaveBeenCalled()
  })

  it('surfaces DB errors', async () => {
    const impl = mockWebPush()
    installMock(impl)
    const select = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
    }))
    const admin = { from: vi.fn(() => ({ select })) }
    const results = await deliverToTenant({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      tenantId: 't-1',
      payload: { title: 'hi', body: 'b' },
    })
    expect(results).toHaveLength(1)
    expect(results[0]!.ok).toBe(false)
    expect(results[0]!.error).toBe('db down')
  })
})
