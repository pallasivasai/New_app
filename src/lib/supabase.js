import { createClient } from '@supabase/supabase-js'

// Browser-safe public anon key only. Never expose service_role/secret keys in client code.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jgubunffqfyapurxpoih.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndWJ1bmZmcWZ5YXB1cnhwb2loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NDc1OTcsImV4cCI6MjEwNTIyMzU5N30.2NSWUHJ4zmessRXknl-Gez9UxwfV-K0riIPZxT58Tf4'

export const supabase = createClient(supabaseUrl, supabaseKey)
