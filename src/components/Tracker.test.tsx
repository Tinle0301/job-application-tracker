import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Tracker } from './Tracker'
import { LocalRepository } from '../lib/localRepository'

describe('Tracker', () => {
  beforeEach(() => localStorage.clear())

  it('adds an application and updates its status inline', async () => {
    render(<Tracker repo={new LocalRepository(localStorage)} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    fireEvent.change(screen.getByLabelText('Company *'), { target: { value: 'Quora' } })
    fireEvent.change(screen.getByLabelText('Role *'), { target: { value: 'ML Platform SWE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add application' }))

    const select = await screen.findByLabelText('Status for Quora')
    fireEvent.change(select, { target: { value: 'interviewing' } })
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe('interviewing'))
  })
})
