export const prerender = false
import type { APIRoute } from 'astro'
import { checkAdminCreds, setSessionAdmin, setSessionTenant } from '../../lib/auth'
import { findTenantByEmail } from '../../lib/tenant-fixtures'

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: { username?: string; password?: string; redirect?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const { username = '', password = '', redirect } = body

  if (checkAdminCreds(username, password)) {
    setSessionAdmin(cookies)
    return new Response(JSON.stringify({ ok: true, redirect: redirect ?? '/admin' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const tenant = findTenantByEmail(username)
  if (tenant && tenant.password === password) {
    setSessionTenant(cookies, tenant.id)
    return new Response(JSON.stringify({ ok: true, redirect: redirect ?? '/portal' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: false, error: 'Invalid credentials' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  })
}
