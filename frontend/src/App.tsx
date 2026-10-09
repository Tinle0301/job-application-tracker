import { api } from './lib/api'
import { supabase } from './lib/supabase'
import { AuthGate } from './components/AuthGate'
import { Tracker } from './components/Tracker'

export default function App() {
  if (!supabase) return <Tracker api={api} />

  return (
    <AuthGate db={supabase}>
      {(session, auth) => (
        <Tracker key={session.user.id} api={api} userEmail={session.user.email} onSignOut={() => auth.signOut()} />
      )}
    </AuthGate>
  )
}
