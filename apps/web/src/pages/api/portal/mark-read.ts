export const prerender = false
import { z } from '@ar/shared'
import { getSession } from '../../../lib/auth'
import { messages } from '../../../lib/tenant-fixtures'
import { apiHandler, notFound, ok, unauthorized } from '../../../lib/api-handler'

const MarkReadInputSchema = z.object({
  messageId: z.string().min(1, 'messageId required'),
})

export const POST = apiHandler(MarkReadInputSchema, (data, { cookies }) => {
  const session = getSession(cookies)
  if (!session || session.type !== 'tenant') {
    return unauthorized()
  }

  const message = messages.find((m) => m.id === data.messageId)
  if (!message || message.tenant_id !== session.tenantId) {
    return notFound('Message not found')
  }

  message.read = true

  return ok({ ok: true })
})
