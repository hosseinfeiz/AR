// Unified API handler + validation + error responses for Astro API routes.
//
// Provides:
//   - `apiHandler(schema, handler)` — wraps an APIRoute, parses + validates JSON
//     against a Zod schema, runs the handler, and converts thrown errors into
//     500 responses with structured logging.
//   - Response builders (`ok`, `badRequest`, `unauthorized`, `forbidden`,
//     `notFound`, `conflict`, `serverError`) that produce JSON `Response`
//     objects with the standard error shape.
//
// Standard error shape (kept stable for clients):
//   { ok: false, error: string, code: string, issues?: ZodIssue[] }
//
// `ok: false` is included for backwards compatibility with the pre-existing
// clients (LoginForm, AddExpenseForm, pay-charge / mark-read callers) which
// branch on `data.ok`. Success bodies are whatever the handler returns.
//
// Request-ID logging is automatic: if `locals.log` is present (injected by the
// global middleware), uncaught handler errors are reported through it; the
// response itself stays clean.

import type { APIContext, APIRoute } from 'astro'
import type { ZodIssue, ZodTypeAny, z } from '@ar/shared'

const JSON_HEADERS = { 'content-type': 'application/json' }

/** Structured error response body emitted by the helpers below. */
export interface ApiErrorBody {
  ok: false
  error: string
  code: string
  issues?: ZodIssue[]
}

/** Minimal log shape we rely on from `locals.log`. Optional everywhere. */
interface LocalsLogger {
  error?: (msg: string, meta?: Record<string, unknown>) => void
  warn?: (msg: string, meta?: Record<string, unknown>) => void
  info?: (msg: string, meta?: Record<string, unknown>) => void
}

function getLogger(ctx: APIContext): LocalsLogger | undefined {
  const locals = ctx.locals as { log?: LocalsLogger } | undefined
  return locals?.log
}

/** Build a JSON success Response (default status 200). */
export function ok<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

/** Generic JSON response helper (any status, any body). */
export function respond<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function errorResponse(
  status: number,
  message: string,
  code: string,
  issues?: ZodIssue[],
): Response {
  const body: ApiErrorBody = issues
    ? { ok: false, error: message, code, issues }
    : { ok: false, error: message, code }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export function badRequest(message: string, code = 'BAD_REQUEST'): Response {
  return errorResponse(400, message, code)
}

export function notFound(message = 'Not found'): Response {
  return errorResponse(404, message, 'NOT_FOUND')
}

export function conflict(message: string): Response {
  return errorResponse(409, message, 'CONFLICT')
}

export function unauthorized(message = 'Unauthorized'): Response {
  return errorResponse(401, message, 'UNAUTHORIZED')
}

export function forbidden(message = 'Forbidden'): Response {
  return errorResponse(403, message, 'FORBIDDEN')
}

export function serverError(message = 'Internal server error'): Response {
  return errorResponse(500, message, 'INTERNAL_ERROR')
}

/**
 * Wrap an API route with JSON parsing, Zod validation, and unified error
 * handling. Pass `null` as the schema for endpoints that ignore the request
 * body (e.g. POST /api/logout).
 */
type ApiHandlerFn<S extends ZodTypeAny | null> = (
  data: S extends ZodTypeAny ? z.infer<S> : undefined,
  ctx: APIContext,
) => Response | Promise<Response>

export function apiHandler<S extends ZodTypeAny | null>(
  schema: S,
  handler: ApiHandlerFn<S>,
): APIRoute {
  return async (ctx) => {
    let data: unknown
    if (schema !== null) {
      let raw: unknown
      try {
        raw = await ctx.request.json()
      } catch {
        return errorResponse(400, 'Invalid JSON body', 'INVALID_JSON')
      }
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        return errorResponse(
          400,
          'Invalid request',
          'VALIDATION_ERROR',
          parsed.error.issues,
        )
      }
      data = parsed.data
    }

    try {
      return await (handler as (d: unknown, c: APIContext) => Response | Promise<Response>)(data, ctx)
    } catch (err) {
      const log = getLogger(ctx)
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      if (log?.error) {
        log.error('api_handler_unhandled_error', {
          message,
          stack,
          url: ctx.request.url,
          method: ctx.request.method,
        })
      } else {
        // Fallback when middleware hasn't injected a logger.
        // eslint-disable-next-line no-console
        console.error('[api-handler] unhandled error', { message, stack })
      }
      return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR')
    }
  }
}
