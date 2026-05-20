// F6: auth helper unit tests.
//
// Targets the auth helpers in apps/web/src/lib/auth.ts.
//
// REFACTOR NEEDED: as of this commit, src/lib/auth.ts does NOT export
// sha256Hex, timingSafeEqualHex, or checkTenantPassword — the file only
// implements a cookie-based session and a single hardcoded
// `checkAdminCreds(username, password)` that just compares to 'admin'/'admin'.
//
// To honour the F6 deliverable list, the planned tests for sha256Hex /
// timingSafeEqualHex / checkTenantPassword are added as skipped specs with
// the rationale documented inline. They become live the moment those
// helpers exist on the auth module.
import { describe, expect, it } from 'vitest'
import { checkAdminCreds } from '../src/lib/auth'

describe('checkAdminCreds (current impl: hardcoded admin/admin)', () => {
  it('returns true for the expected hardcoded creds', () => {
    expect(checkAdminCreds('admin', 'admin')).toBe(true)
  })
  it('returns false for a wrong username', () => {
    expect(checkAdminCreds('root', 'admin')).toBe(false)
  })
  it('returns false for a wrong password', () => {
    expect(checkAdminCreds('admin', 'hunter2')).toBe(false)
  })
  it('returns false when both are wrong', () => {
    expect(checkAdminCreds('', '')).toBe(false)
  })
  // BUG: the current implementation does not use a timing-safe comparison
  // and credentials are hardcoded into source. Marked here for future
  // hardening rather than asserting on the insecure behaviour.
})

describe.skip('sha256Hex', () => {
  // REFACTOR NEEDED: src/lib/auth.ts does not export sha256Hex yet.
  // Expected contract (per F6 plan): sha256Hex(input: string) -> Promise<string>
  // returning the lowercase hex SHA-256 digest of the UTF-8 encoded input.
  it('produces the known SHA-256 hex for an empty string', async () => {
    // const { sha256Hex } = await import('../src/lib/auth')
    // expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
  it('produces the known SHA-256 hex for "abc"', async () => {
    // const { sha256Hex } = await import('../src/lib/auth')
    // expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe.skip('timingSafeEqualHex', () => {
  // REFACTOR NEEDED: src/lib/auth.ts does not export timingSafeEqualHex yet.
  // Expected contract: timingSafeEqualHex(a: string, b: string) -> boolean
  // returning true iff the two hex strings are the same length AND equal,
  // with a comparison loop that runs in time independent of the position
  // of the first differing character.
  it('returns true for equal hex strings', () => {
    // const { timingSafeEqualHex } = await import('../src/lib/auth')
    // expect(timingSafeEqualHex('deadbeef', 'deadbeef')).toBe(true)
  })
  it('returns false for differing hex strings of equal length', () => {
    // expect(timingSafeEqualHex('deadbeef', 'deadbeee')).toBe(false)
  })
  it('returns false for hex strings of unequal length', () => {
    // expect(timingSafeEqualHex('dead', 'deadbeef')).toBe(false)
  })
})

describe.skip('checkAdminCreds (env-driven hashed variant)', () => {
  // REFACTOR NEEDED: the current checkAdminCreds is a hardcoded
  // 'admin'/'admin' string compare. The F6 plan expects an env-driven
  // version that reads ADMIN_USERNAME and ADMIN_PASSWORD_HASH from
  // import.meta.env and verifies via sha256Hex + timingSafeEqualHex.
  it('accepts creds whose SHA-256 matches ADMIN_PASSWORD_HASH', async () => {
    // import.meta.env.ADMIN_USERNAME = 'admin'
    // // sha256('correct horse battery staple')
    // import.meta.env.ADMIN_PASSWORD_HASH =
    //   'c4bbcb1fbec99d65bf59d85c8cb62ee2db963f0fe106f483d9afa73bd4e39a8a'
    // expect(await checkAdminCreds('admin', 'correct horse battery staple')).toBe(true)
  })
  it('rejects creds whose SHA-256 does not match', async () => {
    // expect(await checkAdminCreds('admin', 'wrong')).toBe(false)
  })
})

describe.skip('checkTenantPassword', () => {
  // REFACTOR NEEDED: src/lib/auth.ts does not export checkTenantPassword yet.
  // Expected contract: checkTenantPassword(plaintext, storedHash) -> Promise<boolean>
  // implemented via sha256Hex + timingSafeEqualHex.
  it('returns true when the plaintext hashes to the stored hash', async () => {
    // const { checkTenantPassword } = await import('../src/lib/auth')
    // // sha256('s3cret!')
    // const hash = '...'
    // expect(await checkTenantPassword('s3cret!', hash)).toBe(true)
  })
  it('returns false on a mismatched password', async () => {
    // expect(await checkTenantPassword('nope', '...')).toBe(false)
  })
})
