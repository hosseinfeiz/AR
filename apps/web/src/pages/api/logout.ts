export const prerender = false
import { clearSession } from '../../lib/auth'
import { apiHandler, ok } from '../../lib/api-handler'

export const POST = apiHandler(null, (_data, { cookies }) => {
  clearSession(cookies)
  return ok({ ok: true, redirect: '/' })
})
