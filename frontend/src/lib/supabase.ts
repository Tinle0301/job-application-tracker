import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

/** Names of required Supabase settings that are missing from this build. */
export const missingConfig: string[] = [
  ...(url ? [] : ['VITE_SUPABASE_URL']),
  ...(anonKey ? [] : ['VITE_SUPABASE_ANON_KEY']),
]

/**
 * True when this tab was opened by the sign-up confirmation email link
 * (Supabase redirects with `type=signup`). Read before createClient, which
 * removes the token from the URL.
 */
export const openedFromConfirmationLink =
  typeof window !== 'undefined' && /(^|[#&?])type=signup(&|$)/.test(window.location.hash + window.location.search)

/** Null when env vars are missing; the app then falls back to local demo mode (dev) or shows ConfigError (prod). */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null

/**
 * Demo mode is for local development. A production build without Supabase
 * settings shows a configuration error instead, unless VITE_ALLOW_DEMO=true.
 */
export const demoAllowed = !import.meta.env.PROD || import.meta.env.VITE_ALLOW_DEMO === 'true'
