import { createClient } from '@supabase/supabase-js'
import { clientEnv } from './env'

// Fall back to a placeholder URL so module load succeeds at build time.
// At runtime the env vars must be properly set via .env / deployment config.
const supabaseUrl = clientEnv.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = clientEnv.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
