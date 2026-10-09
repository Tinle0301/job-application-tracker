import { describe, expect, it } from 'vitest'
import { publicSupabaseEnv } from './publicEnv.ts'

describe('publicSupabaseEnv', () => {
  it('prefers VITE_ names', () => {
    expect(publicSupabaseEnv({ VITE_SUPABASE_URL: 'a', SUPABASE_URL: 'b', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual({
      url: 'a',
      anonKey: 'k',
    })
  })

  it('falls back to the Vercel integration names', () => {
    expect(publicSupabaseEnv({ SUPABASE_URL: ' https://x.supabase.co ', SUPABASE_ANON_KEY: 'anon' })).toEqual({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
    })
    expect(publicSupabaseEnv({ SUPABASE_URL: 'u', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1' }).anonKey).toBe(
      'sb_publishable_1',
    )
  })

  it('never uses secret keys', () => {
    const out = publicSupabaseEnv({
      SUPABASE_URL: 'u',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      SUPABASE_SECRET_KEY: 'secret',
      SUPABASE_JWT_SECRET: 'secret',
    })
    expect(out.anonKey).toBe('')
    expect(JSON.stringify(out)).not.toContain('secret')
  })
})
