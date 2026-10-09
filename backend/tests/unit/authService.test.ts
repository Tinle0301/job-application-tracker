import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAuthService, toAuthError, validateCredentials } from '../../services/authService'

function fakeDb(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient
}

describe('validateCredentials', () => {
  it('requires a valid email and an 8+ character password', () => {
    expect(validateCredentials('nope', 'password1')?.code).toBe('INVALID_EMAIL')
    expect(validateCredentials('a@b.co', 'short')?.code).toBe('WEAK_PASSWORD')
    expect(validateCredentials('a@b.co', 'longenough')).toBeNull()
  })
})

describe('toAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'INVALID_CREDENTIALS'],
    [{ message: 'Invalid login credentials' }, 'INVALID_CREDENTIALS'],
    [{ code: 'email_not_confirmed' }, 'EMAIL_NOT_CONFIRMED'],
    [{ code: 'user_already_exists' }, 'EMAIL_IN_USE'],
    [{ code: 'over_email_send_rate_limit' }, 'RATE_LIMITED'],
    [{ status: 429 }, 'RATE_LIMITED'],
    [{ code: 'unexpected_failure', message: 'Database error saving new user' }, 'SIGNUPS_CLOSED'],
    [{ message: 'db exploded at row 7' }, 'AUTH_FAILED'],
  ])('%o → %s', (err, code) => expect(toAuthError(err).code).toBe(code))

  it('never echoes unknown raw messages', () => {
    expect(toAuthError({ message: 'internal detail' }).message).not.toContain('internal')
  })
})

describe('createAuthService', () => {
  it('signs in with trimmed email and maps bad credentials', async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: { code: 'invalid_credentials' } })
    const auth = createAuthService(fakeDb({ signInWithPassword }), 'https://app.test')
    const res = await auth.signIn(' a@b.co ', 'pw')
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' })
    expect(res.error?.message).toBe('Email or password is incorrect.')
  })

  it('reports when sign-up needs email confirmation', async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { user: { id: 'u' }, session: null }, error: null })
    const auth = createAuthService(fakeDb({ signUp }), 'https://app.test')
    expect((await auth.signUp('a@b.co', 'longenough')).data).toEqual({ needsConfirmation: true })
    expect(signUp.mock.calls[0][0].options.emailRedirectTo).toBe('https://app.test')
  })

  it('validates sign-up before calling Supabase', async () => {
    const signUp = vi.fn()
    const auth = createAuthService(fakeDb({ signUp }), 'x')
    expect((await auth.signUp('a@b.co', 'short')).error?.code).toBe('WEAK_PASSWORD')
    expect(signUp).not.toHaveBeenCalled()
  })

  it('does not reveal whether an account exists on password reset', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: { code: 'user_not_found' } })
    const auth = createAuthService(fakeDb({ resetPasswordForEmail }), 'x')
    expect(await auth.sendPasswordReset('ghost@b.co')).toEqual({ data: null, error: null })
  })

  it('magic link never creates new accounts', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null })
    await createAuthService(fakeDb({ signInWithOtp }), 'x').sendMagicLink('a@b.co')
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false)
  })
})
