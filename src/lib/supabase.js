import { createClient } from '@supabase/supabase-js'

// These are public browser-safe values. Never put a service_role/secret key here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jgubunffqfyapurxpoih.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_bTv4ZAC6_NGm8LMyMcB30Q_hvKsfxL3'

export const supabase = createClient(supabaseUrl, supabaseKey)
