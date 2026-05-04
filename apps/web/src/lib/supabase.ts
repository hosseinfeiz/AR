import { createClient } from '@supabase/supabase-js'
import { clientEnv } from './env'

export const supabase = createClient(clientEnv.VITE_SUPABASE_URL, clientEnv.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
