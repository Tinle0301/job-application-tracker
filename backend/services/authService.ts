// authService.ts — email + password auth on Supabase Auth, in the same
// { data, error } style as TrackerApi. Privacy itself is enforced by RLS:
// every row is tied to auth.uid(), so a signed-in user only ever sees their
// own applications (backend/tests/rls_check.sql).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Result, ServiceError } from '../models/types'
import { fail, ok } from './result'

export const MIN_PASSWORD_LENGTH = 8

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCredentials(email: string, password: string): ServiceError | null {
  if (!EMAIL.test(email.trim())) return { code: 'INVALID_EMAIL', message: 'Enter a valid email address.' }
  if (password.length < MIN_PASSWORD_LENGTH)
    return { code: 'WEAK_PASSWORD', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  return null
}

/** Supabase Auth error → stable code + friendly message (never echo raw errors). */
export function toAuthError(e: { code?: string; message?: string; status?: number } | null | undefined): ServiceError {
  const code = e?.code ?? ''
  const msg = (e?.message ?? '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return { code: 'EMAIL_NOT_CONFIRMED', message: 'Please confirm your email first. Check your inbox for the link.' }
  if (code === 'user_already_exists' || msg.includes('already registered'))
    return { code: 'EMAIL_IN_USE', message: 'An account with this email already exists. Sign in instead.' }
  if (code === 'weak_password' || msg.includes('password should'))
    return { code: 'WEAK_PASSWORD', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  if (code === 'same_password')
    return { code: 'SAME_PASSWORD', message: 'Choose a different password from your current one.' }
  if (code.includes('rate_limit') || e?.status === 429)
    return { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute and try again.' }
  return { code: 'AUTH_FAILED', message: 'Something went wrong. Please try again.' }
}

export interface AuthService {
  signIn(email: string, password: string): Promise<Result<null>>
  /** `needsConfirmation` is true when Supabase sent a confirmation email instead of signing in. */
  signUp(email: string, password: string): Promise<Result<{ needsConfirmation: boolean }>>
  sendPasswordReset(email: string): Promise<Result<null>>
  updatePassword(password: string): Promise<Result<null>>
  sendMagicLink(email: string): Promise<Result<null>>
  signOut(): Promise<Result<null>>
}

export function createAuthService(db: SupabaseClient, redirectTo: string): AuthService {
  return {
    async signIn(email, password) {
      if (!EMAIL.test(email.trim())) return fail('INVALID_EMAIL', 'Enter a valid email address.')
      if (!password) return fail('PASSWORD_REQUIRED', 'Enter your password.')
      const { error } = await db.auth.signInWithPassword({ email: email.trim(), password })
      return error ? { data: null, error: toAuthError(error) } : ok(null)
    },

    async signUp(email, password) {
      const invalid = validateCredentials(email, password)
      if (invalid) return { data: null, error: invalid }
      const { data, error } = await db.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo },
      })
      if (error) return { data: null, error: toAuthError(error) }
      // With "Confirm email" on, Supabase returns a user but no session.
      return ok({ needsConfirmation: !data.session })
    },

    async sendPasswordReset(email) {
      if (!EMAIL.test(email.trim())) return fail('INVALID_EMAIL', 'Enter a valid email address.')
      const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      // Same reply whether or not the account exists, so emails can't be probed.
      if (error && (error.status === 429 || (error.code ?? '').includes('rate_limit')))
        return { data: null, error: toAuthError(error) }
      return ok(null)
    },

    async updatePassword(password) {
      if (password.length < MIN_PASSWORD_LENGTH)
        return fail('WEAK_PASSWORD', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      const { error } = await db.auth.updateUser({ password })
      return error ? { data: null, error: toAuthError(error) } : ok(null)
    },

    async sendMagicLink(email) {
      if (!EMAIL.test(email.trim())) return fail('INVALID_EMAIL', 'Enter a valid email address.')
      const { error } = await db.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      })
      if (error && (error.status === 429 || (error.code ?? '').includes('rate_limit')))
        return { data: null, error: toAuthError(error) }
      return ok(null)
    },

    async signOut() {
      const { error } = await db.auth.signOut()
      return error ? { data: null, error: toAuthError(error) } : ok(null)
    },
  }
}
