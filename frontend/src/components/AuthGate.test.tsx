import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthGate, AuthScreen } from './AuthGate'
import type { AuthService } from '@backend/services/authService'

function fakeAuth(overrides: Partial<AuthService> = {}): AuthService {
  const okNull = vi.fn().mockResolvedValue({ data: null, error: null })
  return {
    signIn: okNull,
    signUp: vi.fn().mockResolvedValue({ data: { needsConfirmation: true }, error: null }),
    sendPasswordReset: okNull,
    updatePassword: okNull,
    resendConfirmation: okNull,
    sendMagicLink: okNull,
    signOut: okNull,
    ...overrides,
  }
}

function Screen({ auth, start = 'sign-in' }: { auth: AuthService; start?: 'sign-in' | 'new-password' }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot' | 'magic' | 'new-password'>(start)
  return <AuthScreen auth={auth} mode={mode} setMode={setMode} />
}

describe('AuthScreen', () => {
  it('shows a friendly error when sign-in fails', async () => {
    const auth = fakeAuth({
      signIn: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
      }),
    })
    render(<Screen auth={auth} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-pass' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.')
    expect(auth.signIn).toHaveBeenCalledWith('a@b.co', 'wrong-pass')
  })

  it('signs up after checking the passwords match', async () => {
    const auth = fakeAuth()
    render(<Screen auth={auth} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.')
    expect(auth.signUp).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('confirmation link')
  })

  it('sends a reset link from Forgot password', async () => {
    const auth = fakeAuth()
    render(<Screen auth={auth} />)
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('reset link')
    expect(auth.sendPasswordReset).toHaveBeenCalledWith('a@b.co')
  })

  it('sets a new password after the recovery link', async () => {
    const auth = fakeAuth()
    render(<Screen auth={auth} start="new-password" />)
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brandnew99' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'brandnew99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    await waitFor(() => expect(auth.updatePassword).toHaveBeenCalledWith('brandnew99'))
  })
})

describe('AuthGate confirmation flow', () => {
  function fakeDb() {
    let session: unknown = null
    const db = {
      auth: {
        getSession: vi.fn(async () => ({ data: { session } })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
        signUp: vi.fn(async () => ({ data: { user: { id: 'u1' }, session: null }, error: null })),
        resend: vi.fn(async () => ({ error: null })),
      },
    }
    return {
      db: db as unknown as import('@supabase/supabase-js').SupabaseClient,
      signInElsewhere: () => {
        session = { user: { id: 'u1', email: 'a@b.co' } }
      },
    }
  }

  it('waits after sign-up and opens the app when another tab confirms the email', async () => {
    const { db, signInElsewhere } = fakeDb()
    render(<AuthGate db={db}>{(s) => <p>Tracker for {s.user.email}</p>}</AuthGate>)

    fireEvent.click(await screen.findByRole('button', { name: 'Create an account' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Check your email')).toBeInTheDocument()
    expect(screen.getByText(/opens your tracker automatically/)).toBeInTheDocument()

    // The confirmation tab stores the session in localStorage → `storage` event here.
    signInElsewhere()
    window.dispatchEvent(new StorageEvent('storage', { key: 'sb-x-auth-token' }))
    expect(await screen.findByText('Tracker for a@b.co')).toBeInTheDocument()
  })

  it('can resend the confirmation email', async () => {
    const { db } = fakeDb()
    render(<AuthGate db={db}>{() => <p>app</p>}</AuthGate>)
    fireEvent.click(await screen.findByRole('button', { name: 'Create an account' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'longenough' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'longenough' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Resend email' }))
    expect(await screen.findByText(/Sent again/)).toBeInTheDocument()
  })

  it('tells the confirmation tab it can be closed', async () => {
    const { db, signInElsewhere } = fakeDb()
    signInElsewhere()
    render(
      <AuthGate db={db} openedFromConfirmationLink>
        {() => <p>app</p>}
      </AuthGate>,
    )
    expect(await screen.findByText('Email confirmed ✓')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue in this tab' }))
    expect(await screen.findByText('app')).toBeInTheDocument()
  })
})
