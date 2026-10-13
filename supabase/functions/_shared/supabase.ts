// supabase.ts — per-request client that acts AS the caller (their JWT), so
// Postgres RLS applies to everything the function reads or writes.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export function userClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
}

export const DAILY_AI_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '50')

/** Returns the user id, or null when the request is not signed in. */
export async function currentUser(db: SupabaseClient): Promise<string | null> {
  const { data } = await db.auth.getUser()
  return data.user?.id ?? null
}

export async function overQuota(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc('ai_calls_today')
  if (error) return false
  return Number(data) >= DAILY_AI_LIMIT
}

export const AUTOFILL_LIMIT_MESSAGE = "You've used all your free auto-fills. Fill in the form yourself."

/** Lifetime auto-fills the caller has left (backend/migrations/0006), or null if it can't be read. */
export async function autofillsLeft(db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db.rpc('autofills_left')
  if (error || typeof data !== 'number') return null
  return data
}

/**
 * Service-role client for inbox sync only: it reads the encrypted Gmail
 * tokens (which users have no grants on) and writes email_status_updates.
 * Every query through it filters by the user id it was given.
 */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}
