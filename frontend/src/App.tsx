import { api } from './lib/api'
import { supabase } from './lib/supabase'
import { AuthGate } from './components/AuthGate'
import { Tracker } from './components/Tracker'

export default function App() {
  if (!supabase) return <Tracker api={api} />

  return (
    <AuthGate db={supabase}>
      {(session) => <Tracker api={api} userEmail={session.user.email} onSignOut={() => supabase?.auth.signOut()} />}
    </AuthGate>
  )
}
