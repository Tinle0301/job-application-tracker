import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createAuthService, MIN_PASSWORD_LENGTH, type AuthService } from '@backend/services/authService'

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'magic' | 'new-password'

interface Props {
  db: SupabaseClient
  children: (session: Session, auth: AuthService) => ReactNode
}

/** Shows sign-in / sign-up / password reset until there is a session, then renders the app. */
export function AuthGate({ db, children }: Props) {
  const auth = useMemo(() => createAuthService(db, window.location.origin), [db])
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<Mode>('sign-in')

  useEffect(() => {
    db.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = db.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // The reset-password email link signs the user in with a recovery session.
      if (event === 'PASSWORD_RECOVERY') setMode('new-password')
      if (event === 'SIGNED_OUT') setMode('sign-in')
    })
    return () => data.subscription.unsubscribe()
  }, [db])

  if (!ready) return null
  if (session && mode !== 'new-password') return <>{children(session, auth)}</>
  return <AuthScreen auth={auth} mode={mode} setMode={setMode} />
}

const TITLES: Record<Mode, string> = {
  'sign-in': 'Sign in',
  'sign-up': 'Create your account',
  forgot: 'Reset your password',
  magic: 'Email me a sign-in link',
  'new-password': 'Choose a new password',
}

export function AuthScreen({ auth, mode, setMode }: { auth: AuthService; mode: Mode; setMode: (m: Mode) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const go = (m: Mode) => {
    setMode(m)
    setError(null)
    setNotice(null)
    setPassword('')
    setConfirm('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    if ((mode === 'sign-up' || mode === 'new-password') && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    let message: string | null = null
    if (mode === 'sign-in') {
      const res = await auth.signIn(email, password)
      if (res.error) setError(res.error.message)
    } else if (mode === 'sign-up') {
      const res = await auth.signUp(email, password)
      if (res.error) setError(res.error.message)
      else if (res.data.needsConfirmation)
        message = `We sent a confirmation link to ${email}. Open it to finish signing up.`
    } else if (mode === 'forgot') {
      const res = await auth.sendPasswordReset(email)
      if (res.error) setError(res.error.message)
      else message = `If an account exists for ${email}, a reset link is on its way.`
    } else if (mode === 'magic') {
      const res = await auth.sendMagicLink(email)
      if (res.error) setError(res.error.message)
      else message = `If an account exists for ${email}, a sign-in link is on its way.`
    } else {
      const res = await auth.updatePassword(password)
      if (res.error) setError(res.error.message)
      else {
        setBusy(false)
        go('sign-in') // session is already active, so the app opens
        return
      }
    }
    setBusy(false)
    if (message) setNotice(message)
  }

  const input = 'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm'
  const needsEmail = mode !== 'new-password'
  const needsPassword = mode === 'sign-in' || mode === 'sign-up' || mode === 'new-password'
  const needsConfirm = mode === 'sign-up' || mode === 'new-password'

  return (
    <main className="mx-auto mt-20 max-w-sm px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Job Application Tracker</h1>
      <p className="mt-1 text-sm text-stone-500">Your applications are private to your account.</p>

      <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{TITLES[mode]}</h2>

        {needsEmail && (
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </label>
        )}
        {needsPassword && (
          <label className="block text-sm font-medium">
            {mode === 'sign-in' ? 'Password' : 'New password'}
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'sign-in' ? undefined : MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
          </label>
        )}
        {needsConfirm && (
          <label className="block text-sm font-medium">
            Confirm password
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={input}
            />
          </label>
        )}
        {needsPassword && (
          <div className="flex items-center justify-between text-xs text-stone-500">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
              Show password
            </label>
            {mode !== 'sign-in' && <span>At least {MIN_PASSWORD_LENGTH} characters</span>}
            {mode === 'sign-in' && (
              <button type="button" onClick={() => go('forgot')} className="font-medium text-stone-700 hover:underline">
                Forgot password?
              </button>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {busy
            ? 'Please wait…'
            : {
                'sign-in': 'Sign in',
                'sign-up': 'Create account',
                forgot: 'Send reset link',
                magic: 'Send sign-in link',
                'new-password': 'Save new password',
              }[mode]}
        </button>
      </form>

      <div className="mt-4 space-y-2 text-center text-sm text-stone-600">
        {mode === 'sign-in' && (
          <>
            <p>
              New here?{' '}
              <button onClick={() => go('sign-up')} className="font-medium text-stone-900 hover:underline">
                Create an account
              </button>
            </p>
            <p>
              <button onClick={() => go('magic')} className="hover:underline">
                Email me a sign-in link instead
              </button>
            </p>
          </>
        )}
        {(mode === 'sign-up' || mode === 'forgot' || mode === 'magic') && (
          <p>
            {mode === 'sign-up' ? 'Already have an account? ' : ''}
            <button onClick={() => go('sign-in')} className="font-medium text-stone-900 hover:underline">
              {mode === 'sign-up' ? 'Sign in' : 'Back to sign in'}
            </button>
          </p>
        )}
      </div>
    </main>
  )
}
