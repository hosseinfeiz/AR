// Auth helper unit tests. Targets apps/web/src/lib/auth.ts after the P0
// hardening (async, sha256-based, env-driven admin creds).
import { describe, expect, it } from 'vitest'
import {
  checkAdminCreds,
  checkTenantPassword,
  sha256Hex,
  timingSafeEqualHex,
} from '../src/lib/auth'

describe('sha256Hex', () => {
  it('produces the known SHA-256 hex for an empty string', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })
  it('produces the known SHA-256 hex for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('timingSafeEqualHex', () => {
  it('returns true for equal hex strings', () => {
    expect(timingSafeEqualHex('deadbeef', 'deadbeef')).toBe(true)
  })
  it('returns false for differing hex strings of equal length', () => {
    expect(timingSafeEqualHex('deadbeef', 'deadbeee')).toBe(false)
  })
  it('returns false for hex strings of unequal length', () => {
    expect(timingSafeEqualHex('dead', 'deadbeef')).toBe(false)
  })
})

// The dev-only default is `admin` / SHA-256("admin"). Tests are stable as
// long as env doesn't override (vitest doesn't set ADMIN_PASSWORD_SHA256).
describe('checkAdminCreds (env-driven hashed)', () => {
  it('returns true for the dev-default creds', async () => {
    expect(await checkAdminCreds('admin', 'admin')).toBe(true)
  })
  it('returns false for a wrong username', async () => {
    expect(await checkAdminCreds('root', 'admin')).toBe(false)
  })
  it('returns false for a wrong password', async () => {
    expect(await checkAdminCreds('admin', 'hunter2')).toBe(false)
  })
  it('returns false when both are wrong', async () => {
    expect(await checkAdminCreds('', '')).toBe(false)
  })
})

describe('checkTenantPassword', () => {
  // sha256("tenant123") — the demo-tenant hash baked into tenant-fixtures.ts
  const TENANT_HASH = 'b4f08230cddd4c1bc52a876e12db534f8b40eedb08ba78a5501d1cdf8eb8cb33'

  it('returns true when the plaintext hashes to the stored hash', async () => {
    expect(await checkTenantPassword(TENANT_HASH, 'tenant123')).toBe(true)
  })
  it('returns false on a mismatched password', async () => {
    expect(await checkTenantPassword(TENANT_HASH, 'wrong')).toBe(false)
  })
  it('accepts uppercase stored hash (canonicalizes via toLowerCase)', async () => {
    expect(await checkTenantPassword(TENANT_HASH.toUpperCase(), 'tenant123')).toBe(true)
  })
})
