import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createAuthService, MIN_PASSWORD_LENGTH, type AuthService } from '@backend/services/authService'

type Mode = 'sign-in' | 'sign-up' | 'forgot' | 'magic' | 'new-password'

interface Props {
  db: SupabaseClient
  /** This tab was opened by the confirmation email (see lib/supabase.ts). */
  openedFromConfirmationLink?: boolean
  children: (session: Session, auth: AuthService) => ReactNode
}

/** Shows sign-in / sign-up / password reset until there is a session, then renders the app. */
export function AuthGate({ db, openedFromConfirmationLink = false, children }: Props) {
  const auth = useMemo(() => createAuthService(db, window.location.origin), [db])
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<Mode>('sign-in')
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [showConfirmed, setShowConfirmed] = useState(openedFromConfirmationLink)

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

  // While signed out, pick up a session another tab created (e.g. the tab the
  // confirmation email opened): sessions live in localStorage, which fires a
  // `storage` event here; focus/visibility and a short poll cover the rest.
  const signedIn = Boolean(session)
  const waiting = pendingEmail !== null
  useEffect(() => {
    if (signedIn) return
    const check = () => {
      db.auth.getSession().then(({ data }) => {
        if (data.session) setSession(data.session)
      })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    window.addEventListener('storage', check)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)
    const timer = waiting ? window.setInterval(check, 2500) : undefined
    return () => {
      window.removeEventListener('storage', check)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
      if (timer) window.clearInterval(timer)
    }
  }, [db, signedIn, waiting])

  if (!ready) return null
  if (session && showConfirmed) return <EmailConfirmed onContinue={() => setShowConfirmed(false)} />
  if (session && mode !== 'new-password') return <>{children(session, auth)}</>
  if (pendingEmail)
    return (
      <CheckEmail
        email={pendingEmail}
        auth={auth}
        onBack={() => {
          setPendingEmail(null)
          setMode('sign-in')
        }}
      />
    )
  return <AuthScreen auth={auth} mode={mode} setMode={setMode} onAwaitingConfirmation={setPendingEmail} />
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto mt-20 max-w-sm px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Job Application Tracker</h1>
      <div className="mt-8 space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">{children}</div>
    </main>
  )
}

/** Shown in the original tab after sign-up; it switches to the app on its own once the email is confirmed. */
export function CheckEmail({ email, auth, onBack }: { email: string; auth: AuthService; onBack: () => void }) {
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const resend = async () => {
    setBusy(true)
    const res = await auth.resendConfirmation(email)
    setBusy(false)
    setStatus(
      res.error
        ? { kind: 'error', text: res.error.message }
        : { kind: 'ok', text: 'Sent again. Check your inbox and spam folder.' },
    )
  }
  return (
    <Shell>
      <h2 className="text-lg font-semibold">Check your email</h2>
      <p className="text-sm text-stone-600">
        We sent a confirmation link to <span className="font-medium text-stone-900">{email}</span>. Click it, then come
        back to this tab.
      </p>
      <p role="status" className="flex items-center gap-2 text-sm text-stone-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
        Waiting for confirmation… this page opens your tracker automatically.
      </p>
      {status && (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={status.kind === 'error' ? 'text-sm text-rose-700' : 'text-sm text-emerald-700'}
        >
          {status.text}
        </p>
      )}
      <div className="flex items-center justify-between text-sm">
        <button onClick={onBack} className="text-stone-600 hover:underline">
          Back to sign in
        </button>
        <button
          onClick={resend}
          disabled={busy}
          className="font-medium text-stone-900 hover:underline disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Resend email'}
        </button>
      </div>
      <p className="text-xs text-stone-400">Opened the link on another device? Just sign in here with your password.</p>
    </Shell>
  )
}

/** Shown in the tab the confirmation email opened. */
export function EmailConfirmed({ onContinue }: { onContinue: () => void }) {
  return (
    <Shell>
      <h2 className="text-lg font-semibold">Email confirmed ✓</h2>
      <p className="text-sm text-stone-600">
        You're signed in. You can close this tab and go back to the one where you created your account; it has opened
        your tracker.
      </p>
      <button
        onClick={onContinue}
        className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
      >
        Continue in this tab
      </button>
    </Shell>
  )
}

const TITLES: Record<Mode, string> = {
  'sign-in': 'Sign in',
  'sign-up': 'Create your account',
  forgot: 'Reset your password',
  magic: 'Email me a sign-in link',
  'new-password': 'Choose a new password',
}

export function AuthScreen({
  auth,
  mode,
  setMode,
  onAwaitingConfirmation,
}: {
  auth: AuthService
  mode: Mode
  setMode: (m: Mode) => void
  onAwaitingConfirmation?: (email: string) => void
}) {
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
      else if (res.data.needsConfirmation) {
        if (onAwaitingConfirmation) {
          setBusy(false)
          onAwaitingConfirmation(email.trim())
          return
        }
        message = `We sent a confirmation link to ${email}. Open it to finish signing up.`
      }
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
