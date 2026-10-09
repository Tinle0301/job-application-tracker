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
