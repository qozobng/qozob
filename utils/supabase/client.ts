import { createBrowserClient } from '@supabase/ssr'

// The 'export' keyword here is what the error is looking for
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}