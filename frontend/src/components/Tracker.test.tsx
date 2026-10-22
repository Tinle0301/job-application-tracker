import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { Tracker } from './Tracker'
import { createDemoApi } from '../lib/demoApi'
import type { TrackerApi } from '@backend/services/api'
import type { EmailApplication, EmailUpdate, FitAnalysis, ParsedJob } from '@backend/models/types'

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
    expect(screen.queryByText('Paste a job link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'resume' })).not.toBeInTheDocument()
  })

  it('hides AI controls on Supabase until VITE_ENABLE_AI is on', async () => {
    render(<Tracker api={{ ...createDemoApi(localStorage), mode: 'supabase', aiEnabled: false }} userEmail="a@b.co" />)
    fireEvent.click(await screen.findByText('+ Add application'))
    expect(screen.queryByText('Paste a job link')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Fit' })).not.toBeInTheDocument()
  })
})

describe('Tracker AI features (mocked supabase API)', () => {
  beforeEach(() => localStorage.clear())

  function aiApi(overrides: Partial<TrackerApi>): TrackerApi {
    return { ...createDemoApi(localStorage), mode: 'supabase', aiEnabled: true, ...overrides }
  }

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

  it('auto-fills the form from a pasted job link without overwriting typed fields', async () => {
    const parseJobPosting = vi.fn().mockResolvedValue({ data: parsed, error: null })
    render(<Tracker api={aiApi({ parseJobPosting })} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    fireEvent.change(screen.getByLabelText('Role *'), { target: { value: 'My own title' } })
    const link = screen.getByLabelText('Paste a job link')
    expect(link).toHaveFocus()
    fireEvent.paste(link, { clipboardData: { getData: () => 'https://jobs.lever.co/northwind/1' } })

    await waitFor(() => expect(screen.getByLabelText('Company *')).toHaveValue('Northwind'))
    expect(parseJobPosting).toHaveBeenCalledWith({ url: 'https://jobs.lever.co/northwind/1' })
    expect(screen.getByLabelText('Role *')).toHaveValue('My own title')
    expect(screen.getByLabelText('Salary')).toHaveValue('$90K–$110K')
    expect(screen.getByLabelText('Job posting URL')).toHaveValue('https://jobs.lever.co/northwind/1')
    expect(screen.getByLabelText('Job description')).toHaveValue('Full posting text')
  })

  it('auto-fills from pasted posting text', async () => {
    const parseJobPosting = vi.fn().mockResolvedValue({ data: parsed, error: null })
    render(<Tracker api={aiApi({ parseJobPosting })} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    fireEvent.click(screen.getByRole('button', { name: 'Paste the text instead' }))
    fireEvent.change(screen.getByLabelText('Or paste the posting text'), { target: { value: 'We are hiring…' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    await waitFor(() => expect(screen.getByLabelText('Company *')).toHaveValue('Northwind'))
    expect(parseJobPosting).toHaveBeenCalledWith({ text: 'We are hiring…' })
  })

  it('falls back to pasting the text when the link cannot be read, keeping the link', async () => {
    const parseJobPosting = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'FETCH_FAILED', message: "Couldn't read that page." } })
      .mockResolvedValueOnce({ data: parsed, error: null })
    render(<Tracker api={aiApi({ parseJobPosting })} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    fireEvent.change(screen.getByLabelText('Paste a job link'), { target: { value: 'https://jobs.example.com/1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    expect(await screen.findByText("Couldn't read that page.")).toBeInTheDocument()
    expect(parseJobPosting).toHaveBeenCalledWith({ url: 'https://jobs.example.com/1' })
    expect(screen.getByLabelText('Job posting URL')).toHaveValue('https://jobs.example.com/1')

    fireEvent.change(screen.getByLabelText('Or paste the posting text'), { target: { value: 'We are hiring…' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    await waitFor(() => expect(screen.getByLabelText('Company *')).toHaveValue('Northwind'))
    expect(parseJobPosting).toHaveBeenLastCalledWith({ text: 'We are hiring…', url: 'https://jobs.example.com/1' })
  })

  it('does not submit the form when Enter is pressed in the link box', async () => {
    const parseJobPosting = vi.fn().mockResolvedValue({ data: parsed, error: null })
    render(<Tracker api={aiApi({ parseJobPosting })} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    const link = screen.getByLabelText('Paste a job link')
    fireEvent.change(link, { target: { value: 'https://jobs.example.com/2' } })
    fireEvent.keyDown(link, { key: 'Enter' })
    await waitFor(() => expect(screen.getByLabelText('Company *')).toHaveValue('Northwind'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  const usage = (autofillsUsed: number) =>
    vi.fn().mockResolvedValue({
      data: {
        applications: 0,
        maxApplications: 500,
        writesToday: 0,
        maxWritesPerDay: 1000,
        autofillsUsed,
        maxAutofills: 3,
      },
      error: null,
    })

  it('shows the auto-fills left and hides the link box once they are used up', async () => {
    const parseJobPosting = vi.fn().mockResolvedValue({ data: parsed, error: null })
    render(<Tracker api={aiApi({ parseJobPosting, getUsage: usage(2) })} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    expect(await screen.findByText(/1 of 3 free auto-fills left/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Paste a job link'), { target: { value: 'https://jobs.example.com/3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    expect(await screen.findByText(/used all 3 free auto-fills/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Paste a job link')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Company *')).toHaveValue('Northwind')
  })

  it('keeps the manual form when the user has no auto-fills left', async () => {
    const parseJobPosting = vi.fn()
    render(<Tracker api={aiApi({ parseJobPosting, getUsage: usage(3) })} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    expect(await screen.findByText(/used all 3 free auto-fills/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Paste a job link')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Company *')).toBeInTheDocument()
    expect(parseJobPosting).not.toHaveBeenCalled()
  })

  it('switches to the manual form when the server says the limit is reached', async () => {
    const parseJobPosting = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'AUTOFILL_LIMIT', message: "You've used all your free auto-fills." },
    })
    render(<Tracker api={aiApi({ parseJobPosting })} />)
    fireEvent.click(await screen.findByText('+ Add application'))
    fireEvent.change(screen.getByLabelText('Paste a job link'), { target: { value: 'https://jobs.example.com/4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }))
    expect(await screen.findByText(/used all your free auto-fills/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Paste a job link')).not.toBeInTheDocument()
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
      model: 'test-model',
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

describe('Tracker email sync (mocked supabase API)', () => {
  beforeEach(() => localStorage.clear())

  async function withApp() {
    const base = createDemoApi(localStorage)
    const created = await base.createApplication({
      company: 'Contoso',
      role: 'SWE',
      location: '',
      url: '',
      status: 'applied',
      appliedOn: null,
      salary: '',
      notes: '',
      jobDescription: '',
    })
    return { base, appId: created.data!.id }
  }

  const update = (over: Partial<EmailUpdate>): EmailUpdate => ({
    id: 'u1',
    applicationId: '',
    fromAddress: 'talent@contoso.com',
    subject: 'Interview invitation',
    receivedAt: new Date().toISOString(),
    detectedStatus: 'interviewing',
    previousStatus: 'applied',
    reason: 'Invites you to a phone screen',
    state: 'applied',
    ...over,
  })

  it('hides the email panel until VITE_ENABLE_EMAIL_SYNC is on', async () => {
    render(<Tracker api={{ ...createDemoApi(localStorage), mode: 'supabase' }} />)
    await screen.findByText('+ Add application')
    expect(screen.queryByRole('region', { name: 'Email updates' })).not.toBeInTheDocument()
  })

  it('offers to connect Gmail and opens Google when clicked', async () => {
    const startEmailConnect = vi.fn().mockResolvedValue({ data: null, error: { code: 'X', message: 'Not set up.' } })
    render(
      <Tracker api={{ ...createDemoApi(localStorage), mode: 'supabase', emailSyncEnabled: true, startEmailConnect }} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Gmail' }))
    expect(await screen.findByText('Not set up.')).toBeInTheDocument()
    expect(startEmailConnect).toHaveBeenCalled()
  })

  it('checks a stale inbox on open, lists the change and undoes it', async () => {
    const { base, appId } = await withApp()
    let updates = [update({ applicationId: appId })]
    const scanEmail = vi.fn(async () => {
      await base.updateStatus(appId, 'interviewing')
      return {
        data: { scanned: 4, matched: 1, applied: 1, suggested: 0, added: 0, toAdd: 0, complete: true },
        error: null,
      }
    })
    const undoEmailUpdate = vi.fn(async () => {
      await base.updateStatus(appId, 'applied')
      updates = [{ ...updates[0], state: 'undone' }]
      return { data: null, error: null }
    })
    const api = {
      ...base,
      mode: 'supabase' as const,
      emailSyncEnabled: true,
      getEmailConnection: vi.fn().mockResolvedValue({
        data: { email: 'tin@gmail.com', status: 'connected', lastScanAt: null, connectedAt: '2026-10-01T00:00:00Z' },
        error: null,
      }),
      scanEmail,
      listEmailUpdates: vi.fn(async () => ({ data: updates, error: null })),
      undoEmailUpdate,
    }
    render(<Tracker api={api} />)

    expect(await screen.findByText('1 status updated.')).toBeInTheDocument()
    expect(scanEmail).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByLabelText('Status for Contoso')).toHaveValue('interviewing'))
    const panel = screen.getByRole('region', { name: 'Email updates' })
    expect(within(panel).getByText(/Interview invitation/)).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: 'Undo Contoso update' }))
    await waitFor(() => expect(screen.getByLabelText('Status for Contoso')).toHaveValue('applied'))
    expect(undoEmailUpdate).toHaveBeenCalledWith('u1')
    expect(within(panel).queryByText(/Interview invitation/)).not.toBeInTheDocument()
  })

  it('lets the user apply or dismiss a suggestion without scanning a fresh inbox', async () => {
    const { base, appId } = await withApp()
    const applyEmailUpdate = vi.fn().mockResolvedValue({ data: null, error: null })
    const scanEmail = vi.fn()
    const api = {
      ...base,
      mode: 'supabase' as const,
      emailSyncEnabled: true,
      getEmailConnection: vi.fn().mockResolvedValue({
        data: { email: 'tin@gmail.com', status: 'connected', lastScanAt: new Date().toISOString(), connectedAt: '' },
        error: null,
      }),
      scanEmail,
      listEmailUpdates: vi.fn().mockResolvedValue({
        data: [update({ applicationId: appId, state: 'suggested', detectedStatus: 'rejected' })],
        error: null,
      }),
      applyEmailUpdate,
    }
    render(<Tracker api={api} />)
    const panel = await screen.findByRole('region', { name: 'Email updates' })
    expect(within(panel).getByText(/checked just now/)).toBeInTheDocument()
    fireEvent.click(await within(panel).findByRole('button', { name: 'Apply Contoso update' }))
    await waitFor(() => expect(applyEmailUpdate).toHaveBeenCalledWith('u1'))
    expect(scanEmail).not.toHaveBeenCalled()
  })

  const found = (over: Partial<EmailApplication>): EmailApplication => ({
    id: 'n1',
    applicationId: null,
    fromAddress: 'no-reply@greenhouse.io',
    subject: 'Thanks for applying to Fabrikam',
    receivedAt: new Date().toISOString(),
    link: 'https://mail.google.com/mail/?authuser=tin%40gmail.com#all/m9',
    company: 'Fabrikam',
    role: 'Data Analyst',
    reason: 'Confirms your application was received',
    state: 'suggested',
    ...over,
  })

  it('adds applications found in confirmation emails and can undo one', async () => {
    const base = createDemoApi(localStorage)
    let items: EmailApplication[] = []
    const scanEmail = vi.fn(async () => {
      const created = await base.createApplication({
        company: 'Fabrikam',
        role: 'Data Analyst',
        location: '',
        url: '',
        status: 'applied',
        appliedOn: '2026-10-12',
        salary: '',
        notes: '',
        jobDescription: '',
      })
      items = [found({ state: 'created', applicationId: created.data!.id })]
      return {
        data: { scanned: 3, matched: 0, applied: 0, suggested: 0, added: 1, toAdd: 0, complete: true },
        error: null,
      }
    })
    const undoEmailApplication = vi.fn(async () => {
      await base.deleteApplication(items[0].applicationId!)
      items = []
      return { data: null, error: null }
    })
    const api = {
      ...base,
      mode: 'supabase' as const,
      emailSyncEnabled: true,
      getEmailConnection: vi.fn().mockResolvedValue({
        data: { email: 'tin@gmail.com', status: 'connected', lastScanAt: null, connectedAt: '' },
        error: null,
      }),
      scanEmail,
      listEmailApplications: vi.fn(async () => ({ data: items, error: null })),
      undoEmailApplication,
    }
    render(<Tracker api={api} />)

    expect(await screen.findByText('1 application added.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Status for Fabrikam')).toHaveValue('applied'))
    const panel = screen.getByRole('region', { name: 'Email updates' })
    expect(within(panel).getByRole('link', { name: /Thanks for applying to Fabrikam/ })).toHaveAttribute(
      'href',
      expect.stringContaining('mail.google.com'),
    )

    fireEvent.click(within(panel).getByRole('button', { name: 'Undo adding Fabrikam' }))
    await waitFor(() => expect(screen.queryByLabelText('Status for Fabrikam')).not.toBeInTheDocument())
    expect(undoEmailApplication).toHaveBeenCalledWith('n1')
  })

  it('lets the user fill in a missing role before adding a suggestion', async () => {
    const addEmailApplication = vi.fn().mockResolvedValue({ data: null, error: null })
    const dismissEmailApplication = vi.fn().mockResolvedValue({ data: null, error: null })
    const api = {
      ...createDemoApi(localStorage),
      mode: 'supabase' as const,
      emailSyncEnabled: true,
      getEmailConnection: vi.fn().mockResolvedValue({
        data: { email: 'tin@gmail.com', status: 'connected', lastScanAt: new Date().toISOString(), connectedAt: '' },
        error: null,
      }),
      scanEmail: vi.fn(),
      listEmailApplications: vi.fn().mockResolvedValue({
        data: [found({ role: '' }), found({ id: 'n2', company: 'Litware', subject: 'Your application to Litware' })],
        error: null,
      }),
      addEmailApplication,
      dismissEmailApplication,
    }
    render(<Tracker api={api} />)
    const panel = await screen.findByRole('region', { name: 'Email updates' })
    const add = await within(panel).findByRole('button', { name: 'Add Fabrikam' })
    expect(add).toBeDisabled()
    fireEvent.change(within(panel).getAllByLabelText('Role')[0], { target: { value: 'Data Analyst' } })
    fireEvent.click(add)
    await waitFor(() =>
      expect(addEmailApplication).toHaveBeenCalledWith('n1', { company: 'Fabrikam', role: 'Data Analyst' }),
    )
    fireEvent.click(within(panel).getByRole('button', { name: 'Dismiss Litware' }))
    await waitFor(() => expect(dismissEmailApplication).toHaveBeenCalledWith('n2'))
  })

  it('asks to reconnect when Google access expired', async () => {
    render(
      <Tracker
        api={{
          ...createDemoApi(localStorage),
          mode: 'supabase',
          emailSyncEnabled: true,
          getEmailConnection: vi.fn().mockResolvedValue({
            data: { email: 'tin@gmail.com', status: 'needs_reconnect', lastScanAt: null, connectedAt: '' },
            error: null,
          }),
        }}
      />,
    )
    expect(await screen.findByRole('button', { name: 'Reconnect Gmail' })).toBeInTheDocument()
    expect(screen.getByText(/Google access expired/)).toBeInTheDocument()
  })

  it("lists a job's emails with their dates in its row", async () => {
    const { base } = await withApp()
    const listed = (await base.listApplications()).data!
    const emails = [
      {
        id: 'e2',
        fromName: 'Contoso Talent',
        fromAddress: 'talent@contoso.com',
        subject: 'Interview invitation',
        receivedAt: '2026-10-15T17:00:00Z',
        link: 'https://mail.google.com/mail/#all/e2',
      },
      {
        id: 'e1',
        fromName: '',
        fromAddress: 'no-reply@greenhouse.io',
        subject: 'Thanks for applying to Contoso',
        receivedAt: '2026-10-02T17:00:00Z',
        link: '',
      },
    ]
    render(
      <Tracker
        api={{
          ...base,
          mode: 'supabase',
          emailSyncEnabled: true,
          listApplications: vi.fn().mockResolvedValue({ data: [{ ...listed[0], emails }], error: null }),
        }}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Contoso' }))
    expect(screen.getByText('Emails (2)')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('@'))
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Interview invitation'),
      expect.stringContaining('Thanks for applying to Contoso'),
    ])
    expect(within(items[0]).getByText('Oct 15, 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Interview invitation' })).toHaveAttribute('href', emails[0].link)
    expect(within(items[0]).getByText('Contoso Talent <talent@contoso.com>')).toBeInTheDocument()
  })

  it('shows the job posting link and description in the row', async () => {
    const base = createDemoApi(localStorage)
    await base.createApplication({
      company: 'IBM',
      role: 'Software Engineering Intern 2027',
      location: '',
      url: 'https://careers.ibm.com/job/21587432',
      status: 'applied',
      appliedOn: '2026-10-14',
      salary: '',
      notes: '',
      jobDescription: 'Build cloud tools with Go and TypeScript.',
    })
    render(<Tracker api={base} />)
    fireEvent.click(await screen.findByRole('button', { name: 'IBM' }))
    expect(screen.getByRole('link', { name: 'https://careers.ibm.com/job/21587432' })).toBeInTheDocument()
    expect(screen.getByText('Build cloud tools with Go and TypeScript.')).toBeInTheDocument()
    expect(screen.queryByText('No notes')).not.toBeInTheDocument()
  })

  it('opens the matching job with the description the bookmark sent', async () => {
    const base = createDemoApi(localStorage)
    await base.createApplication({
      company: 'IBM',
      role: 'Software Developer Intern',
      location: '',
      url: 'https://careers.ibm.com/en_US/careers/JobDetail/Software-Developer-Intern-2027/128497',
      status: 'applied',
      appliedOn: '2026-10-14',
      salary: '',
      notes: '',
      jobDescription: '',
    })
    const page = {
      u: 'https://careers.ibm.com/en_US/careers/JobDetail/Software-Developer-Intern-2027/128497?x=1',
      t: 'Write code.',
    }
    window.history.replaceState(null, '', '/#jd=' + encodeURIComponent(JSON.stringify(page)))
    render(<Tracker api={base} />)
    expect(await screen.findByLabelText('Job description')).toHaveValue('Write code.')
    expect(screen.getByLabelText('Company *')).toHaveValue('IBM')
    expect(window.location.hash).toBe('')
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'IBM' }))
    expect(screen.getByText('Write code.')).toBeInTheDocument()
  })
})
