import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { Tracker } from './Tracker'
import { createDemoApi } from '../lib/demoApi'
import type { TrackerApi } from '@backend/services/api'
import type { FitAnalysis, ParsedJob } from '@backend/models/types'

describe('Tracker (demo mode)', () => {
  beforeEach(() => localStorage.clear())

  it('adds an application and updates its status inline', async () => {
    render(<Tracker api={createDemoApi(localStorage)} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    fireEvent.change(screen.getByLabelText('Company *'), { target: { value: 'Quora' } })
    fireEvent.change(screen.getByLabelText('Role *'), { target: { value: 'ML Platform SWE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add application' }))

    const select = await screen.findByLabelText('Status for Quora')
    fireEvent.change(select, { target: { value: 'interviewing' } })
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe('interviewing'))
  })

  it('keeps the form open and shows the error code message on invalid input', async () => {
    render(<Tracker api={createDemoApi(localStorage)} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    fireEvent.change(screen.getByLabelText('Company *'), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText('Role *'), { target: { value: 'SWE' } })
    fireEvent.change(screen.getByLabelText('Date applied'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Job description'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('Job posting URL'), { target: { value: 'ftp://nope' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Add application' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('http')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the usage meter and refreshes it after adding', async () => {
    render(<Tracker api={createDemoApi(localStorage)} />)
    expect(await screen.findByText('0 of 500 applications')).toBeInTheDocument()
    fireEvent.click(screen.getByText('+ Add application'))
    fireEvent.change(screen.getByLabelText('Company *'), { target: { value: 'Quora' } })
    fireEvent.change(screen.getByLabelText('Role *'), { target: { value: 'SWE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add application' }))
    expect(await screen.findByText('1 of 500 applications')).toBeInTheDocument()
  })

  it('hides AI controls in demo mode', async () => {
    render(<Tracker api={createDemoApi(localStorage)} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    expect(screen.queryByText('Auto-fill with AI')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'resume' })).not.toBeInTheDocument()
  })

  it('hides AI controls on Supabase until VITE_ENABLE_AI is on', async () => {
    render(<Tracker api={{ ...createDemoApi(localStorage), mode: 'supabase', aiEnabled: false }} userEmail="a@b.co" />)
    fireEvent.click(await screen.findByText('+ Add application'))
    expect(screen.queryByText('Auto-fill with AI')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Fit' })).not.toBeInTheDocument()
  })
})

describe('Tracker AI features (mocked supabase API)', () => {
  beforeEach(() => localStorage.clear())

  function aiApi(overrides: Partial<TrackerApi>): TrackerApi {
    return { ...createDemoApi(localStorage), mode: 'supabase', aiEnabled: true, ...overrides }
  }

  it('auto-fills the form from a pasted posting without overwriting typed fields', async () => {
    const parsed: ParsedJob = {
      company: 'Northwind',
      role: 'Data Analyst',
      location: 'Remote (US)',
      salary: '$90K–$110K',
      employmentType: 'Full-time',
      requirements: ['SQL', 'Python'],
      summary: 'Build dashboards.',
      description: 'Full posting text',
    }
    const parseJobPosting = vi.fn().mockResolvedValue({ data: parsed, error: null })
    render(<Tracker api={aiApi({ parseJobPosting })} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    fireEvent.change(screen.getByLabelText('Role *'), { target: { value: 'My own title' } })
    fireEvent.change(screen.getByLabelText('Auto-fill with AI'), { target: { value: 'We are hiring…' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))

    await waitFor(() => expect(screen.getByLabelText('Company *')).toHaveValue('Northwind'))
    expect(parseJobPosting).toHaveBeenCalledWith({ text: 'We are hiring…' })
    expect(screen.getByLabelText('Role *')).toHaveValue('My own title')
    expect(screen.getByLabelText('Salary')).toHaveValue('$90K–$110K')
    expect(screen.getByLabelText('Job description')).toHaveValue('Full posting text')
  })

  it('sends a URL as { url } and shows the error message', async () => {
    const parseJobPosting = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: 'FETCH_FAILED', message: "Couldn't read that page." } })
    render(<Tracker api={aiApi({ parseJobPosting })} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    fireEvent.change(screen.getByLabelText('Auto-fill with AI'), { target: { value: 'https://jobs.example.com/1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    expect(await screen.findByText("Couldn't read that page.")).toBeInTheDocument()
    expect(parseJobPosting).toHaveBeenCalledWith({ url: 'https://jobs.example.com/1' })
  })

  it('analyzes fit and shows the score in the row and the detail panel', async () => {
    const base = createDemoApi(localStorage)
    await base.createApplication({
      company: 'Contoso',
      role: 'SWE',
      location: '',
      url: '',
      status: 'applied',
      appliedOn: null,
      salary: '',
      notes: '',
      jobDescription: 'React TypeScript Postgres '.repeat(10),
    })
    const analysis: FitAnalysis = {
      id: 'a1',
      score: 82,
      matchedSkills: ['React'],
      missingSkills: ['Kubernetes'],
      summary: 'Strong frontend match.',
      suggestions: ['Quantify the POS project impact.'],
      model: 'claude-sonnet-5-5',
      createdAt: new Date().toISOString(),
    }
    const analyzeFit = vi.fn().mockResolvedValue({ data: analysis, error: null })
    render(<Tracker api={{ ...base, mode: 'supabase', aiEnabled: true, analyzeFit }} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Contoso' }))
    fireEvent.click(screen.getByRole('button', { name: 'Analyze fit' }))
    const panel = await screen.findByRole('region', { name: 'Resume match' })
    await within(panel).findByText('Strong frontend match.')
    expect(within(panel).getByText('Kubernetes')).toBeInTheDocument()
    expect(screen.getByTitle('Resume match: 82/100')).toBeInTheDocument()
  })

  it('saves a resume from the Resume tab', async () => {
    render(<Tracker api={aiApi({})} />)
    fireEvent.click(await screen.findByRole('button', { name: 'resume' }))
    fireEvent.change(await screen.findByLabelText('Resume text'), { target: { value: 'Experience '.repeat(10) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save resume' }))
    expect(await screen.findByText('Resume saved.')).toBeInTheDocument()
  })
})
