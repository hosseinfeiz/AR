export const prerender = false
import { z } from '@ar/shared'
import { checkAdminCreds, checkTenantPassword, setSessionAdmin, setSessionTenant } from '../../lib/auth'
import { findTenantByEmail } from '../../lib/tenant-fixtures'
import { apiHandler, ok, respond } from '../../lib/api-handler'

const LoginInputSchema = z.object({
  username: z.string().default(''),
  password: z.string().default(''),
  redirect: z.string().optional(),
})

export const POST = apiHandler(LoginInputSchema, async (data, { cookies }) => {
  const { username, password, redirect } = data

  if (await checkAdminCreds(username, password)) {
    setSessionAdmin(cookies)
    return ok({ ok: true, redirect: redirect ?? '/admin' })
  }

  const tenant = findTenantByEmail(username)
  if (tenant && (await checkTenantPassword(tenant.password_sha256, password))) {
    setSessionTenant(cookies, tenant.id)
    return ok({ ok: true, redirect: redirect ?? '/portal' })
  }

  return respond({ ok: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, 401)
})
