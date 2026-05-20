import type { AstroCookies } from 'astro'

export type Session =
  | { type: 'admin' }
  | { type: 'tenant'; tenantId: string }
  | null

const COOKIE = 'ar_auth'
const SEVEN_DAYS = 60 * 60 * 24 * 7

const ADMIN_USERNAME = import.meta.env.ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD_SHA256 =
  import.meta.env.ADMIN_PASSWORD_SHA256 ??
  // SHA-256("admin") — dev-only default; production MUST override via env.
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'

const IS_PROD = import.meta.env.PROD === true

export function getSession(cookies: AstroCookies): Session {
  const v = cookies.get(COOKIE)?.value
  if (!v) return null
  if (v === 'admin') return { type: 'admin' }
  if (v.startsWith('tenant:')) return { type: 'tenant', tenantId: v.slice('tenant:'.length) }
  return null
}

function cookieOpts() {
  return {
    path: '/',
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax' as const,
    maxAge: SEVEN_DAYS,
  }
}

export function setSessionAdmin(cookies: AstroCookies) {
  cookies.set(COOKIE, 'admin', cookieOpts())
}

export function setSessionTenant(cookies: AstroCookies, tenantId: string) {
  cookies.set(COOKIE, `tenant:${tenantId}`, cookieOpts())
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: '/' })
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Constant-time string comparison. Both strings must be hex of equal length.
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function checkAdminCreds(username: string, password: string): Promise<boolean> {
  if (username !== ADMIN_USERNAME) return false
  const candidate = await sha256Hex(password)
  return timingSafeEqualHex(candidate, ADMIN_PASSWORD_SHA256.toLowerCase())
}

export async function checkTenantPassword(stored_sha256: string, password: string): Promise<boolean> {
  const candidate = await sha256Hex(password)
  return timingSafeEqualHex(candidate, stored_sha256.toLowerCase())
}
