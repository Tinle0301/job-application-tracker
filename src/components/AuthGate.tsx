import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

/** Requires a Supabase session (email magic link) before rendering children. */
export function AuthGate({ db, children }: { db: SupabaseClient; children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    db.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [db])

  const signIn = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    if (error) setError(error.message)
    else setSent(true)
  }

  if (!ready) return null
  if (session) return <>{children(session)}</>

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="text-2xl font-semibold">Job Application Tracker</h1>
      <p className="mt-2 text-sm text-stone-600">Sign in with a magic link to see your applications.</p>
      {sent ? (
        <p className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          Check {email} for your sign-in link.
        </p>
      ) : (
        <form onSubmit={signIn} className="mt-6 space-y-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <button className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white">
            Send magic link
          </button>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      )}
    </main>
  )
}
