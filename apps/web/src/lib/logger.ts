// Structured JSON logger. Every record is one line of JSON so it parses cleanly
// in Vercel / Cloudflare log drains. Use a child logger via `logger.with({...})`
// to bind request-scoped context (request_id, path, session type).

type Level = 'debug' | 'info' | 'warn' | 'error'

interface LogRecord {
  ts: string
  level: Level
  msg: string
  [k: string]: unknown
}

function emit(level: Level, msg: string, context: Record<string, unknown>, err?: unknown) {
  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...context,
  }
  if (err instanceof Error) {
    record.error = { name: err.name, message: err.message, stack: err.stack }
  } else if (err !== undefined) {
    record.error = err
  }
  const line = JSON.stringify(record)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>, err?: unknown): void
  error(msg: string, err?: unknown, ctx?: Record<string, unknown>): void
  with(ctx: Record<string, unknown>): Logger
}

export function makeLogger(base: Record<string, unknown> = {}): Logger {
  return {
    debug(msg, ctx = {}) { emit('debug', msg, { ...base, ...ctx }) },
    info(msg, ctx = {}) { emit('info', msg, { ...base, ...ctx }) },
    warn(msg, ctx = {}, err) { emit('warn', msg, { ...base, ...ctx }, err) },
    error(msg, err, ctx = {}) { emit('error', msg, { ...base, ...ctx }, err) },
    with(ctx) { return makeLogger({ ...base, ...ctx }) },
  }
}

export const logger = makeLogger()
