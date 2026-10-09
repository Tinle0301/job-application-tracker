import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConfigError } from './ConfigError'

describe('ConfigError', () => {
  it('lists the missing environment variables', () => {
    render(<ConfigError missing={['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']} />)
    expect(screen.getByRole('alert')).toHaveTextContent("isn't connected to its database")
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument()
    expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument()
  })
})
