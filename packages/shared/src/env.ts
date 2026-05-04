import { z } from 'zod'

export const ClientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_TURNSTILE_SITE_KEY: z.string().min(10),
  VITE_SENTRY_DSN: z.string().url().optional(),
})

export const ServerEnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  RESEND_API_KEY: z.string().startsWith('re_'),
  RESEND_FROM_EMAIL: z.string().email(),
  TURNSTILE_SECRET_KEY: z.string().min(10),
  EMERGENCY_WEBHOOK_URL: z.string().url().optional(),
})

export type ClientEnv = z.infer<typeof ClientEnvSchema>
export type ServerEnv = z.infer<typeof ServerEnvSchema>
