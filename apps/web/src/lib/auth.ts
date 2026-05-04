import type { AstroCookies } from 'astro'

export type Session =
  | { type: 'admin' }
  | { type: 'tenant'; tenantId: string }
  | null

const COOKIE = 'ar_auth'

export function getSession(cookies: AstroCookies): Session {
  const v = cookies.get(COOKIE)?.value
  if (!v) return null
  if (v === 'admin') return { type: 'admin' }
  if (v.startsWith('tenant:')) return { type: 'tenant', tenantId: v.slice('tenant:'.length) }
  return null
}

export function setSessionAdmin(cookies: AstroCookies) {
  cookies.set(COOKIE, 'admin', { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7 })
}

export function setSessionTenant(cookies: AstroCookies, tenantId: string) {
  cookies.set(COOKIE, `tenant:${tenantId}`, { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7 })
}

export function clearSession(cookies: AstroCookies) {
  cookies.delete(COOKIE, { path: '/' })
}

export function checkAdminCreds(username: string, password: string): boolean {
  return username === 'admin' && password === 'admin'
}
