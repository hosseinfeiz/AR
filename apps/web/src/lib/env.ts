import { ClientEnvSchema, ServerEnvSchema } from '@ar/shared'

// Use safeParse so missing env vars during build don't throw at module load time.
// At runtime (dev/production) the required vars must be set or Supabase calls will fail.
const _clientEnvResult = ClientEnvSchema.safeParse({
  VITE_SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  VITE_TURNSTILE_SITE_KEY: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
  VITE_SENTRY_DSN: import.meta.env.PUBLIC_SENTRY_DSN,
})

export const clientEnv = _clientEnvResult.success
  ? _clientEnvResult.data
  : {
      VITE_SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL ?? '',
      VITE_SUPABASE_ANON_KEY: import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
      VITE_TURNSTILE_SITE_KEY: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '',
      VITE_SENTRY_DSN: import.meta.env.PUBLIC_SENTRY_DSN as string | undefined,
    }

export function serverEnv() {
  return ServerEnvSchema.parse({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    EMERGENCY_WEBHOOK_URL: process.env.EMERGENCY_WEBHOOK_URL,
  })
}
