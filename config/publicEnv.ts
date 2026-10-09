// publicEnv.ts — picks the ONLY Supabase values that may be baked into the
// browser bundle. Accepts our VITE_* names or the names the Vercel ↔ Supabase
// integration creates. Secrets the integration also adds (service role key,
// JWT secret, Postgres password) are never read here.

type Env = Record<string, string | undefined>

const first = (env: Env, names: string[]) => names.map((n) => env[n]?.trim()).find((v): v is string => Boolean(v)) ?? ''

export function publicSupabaseEnv(env: Env): { url: string; anonKey: string } {
  return {
    url: first(env, ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']),
    anonKey: first(env, [
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ]),
  }
}
