import { api } from './lib/api'
import { demoAllowed, missingConfig, supabase } from './lib/supabase'
import { AuthGate } from './components/AuthGate'
import { Tracker } from './components/Tracker'
import { ConfigError } from './components/ConfigError'

export default function App() {
  if (!supabase) return demoAllowed ? <Tracker api={api} /> : <ConfigError missing={missingConfig} />

  return (
    <AuthGate db={supabase}>
      {(session, auth) => (
        <Tracker key={session.user.id} api={api} userEmail={session.user.email} onSignOut={() => auth.signOut()} />
      )}
    </AuthGate>
  )
}
