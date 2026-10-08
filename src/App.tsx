import { useMemo } from 'react'
import { supabase } from './lib/supabase'
import { SupabaseRepository } from './lib/supabaseRepository'
import { LocalRepository } from './lib/localRepository'
import { AuthGate } from './components/AuthGate'
import { Tracker } from './components/Tracker'

export default function App() {
  const localRepo = useMemo(() => new LocalRepository(), [])
  const remoteRepo = useMemo(() => (supabase ? new SupabaseRepository(supabase) : null), [])

  if (!supabase || !remoteRepo) return <Tracker repo={localRepo} />

  return (
    <AuthGate db={supabase}>
      {(session) => (
        <Tracker repo={remoteRepo} userEmail={session.user.email} onSignOut={() => supabase?.auth.signOut()} />
      )}
    </AuthGate>
  )
}
