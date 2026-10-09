import { beforeEach, describe, expect, it } from 'vitest'
import { createDemoApi, DEMO_MAX_APPLICATIONS } from './demoApi'
import type { ApplicationInput } from '@backend/models/types'

const input: ApplicationInput = {
  company: 'Affirm',
  role: 'Analyst',
  location: 'Remote',
  url: '',
  status: 'applied',
  appliedOn: '2026-10-07',
  salary: '',
  notes: '',
  jobDescription: '',
}

describe('demo API', () => {
  let api: ReturnType<typeof createDemoApi>
  beforeEach(() => {
    localStorage.clear()
    api = createDemoApi(localStorage)
  })

  it('creates an application with an initial history entry', async () => {
    const { data, error } = await api.createApplication(input)
    expect(error).toBeNull()
    expect(data?.history).toHaveLength(1)
    expect((await api.listApplications()).data).toHaveLength(1)
  })

  it('records a history entry only when status changes', async () => {
    const created = (await api.createApplication(input)).data!
    await api.updateStatus(created.id, 'applied')
    const moved = (await api.updateStatus(created.id, 'interviewing')).data!
    expect(moved.history.map((h) => h.status)).toEqual(['applied', 'interviewing'])
  })

  it('persists across instances via storage', async () => {
    await api.createApplication(input)
    expect((await createDemoApi(localStorage).listApplications()).data).toHaveLength(1)
  })

  it('upgrades v1 data that has no jobDescription / latestAnalysis', async () => {
    localStorage.setItem(
      'job-tracker:applications:v1',
      JSON.stringify([{ id: 'x', company: 'A', role: 'B', history: [] }]),
    )
    const [app] = (await api.listApplications()).data!
    expect(app.jobDescription).toBe('')
    expect(app.latestAnalysis).toBeNull()
  })

  it('removes an application', async () => {
    const created = (await api.createApplication(input)).data!
    await api.deleteApplication(created.id)
    expect((await api.listApplications()).data).toHaveLength(0)
  })

  it('returns error codes instead of throwing', async () => {
    expect((await api.updateStatus('missing', 'offer')).error?.code).toBe('APPLICATION_NOT_FOUND')
    expect((await api.createApplication({ ...input, company: ' ' })).error?.code).toBe('COMPANY_REQUIRED')
    expect((await api.createApplication({ ...input, url: 'ftp://x' })).error?.code).toBe('INVALID_URL')
  })

  it('validates import rows with the row number', async () => {
    const { error } = await api.importApplications([input, { ...input, role: '' }])
    expect(error).toEqual({ code: 'ROLE_REQUIRED', message: 'Row 2: Role is required.' })
    expect((await api.listApplications()).data).toHaveLength(0)
  })

  it('saves and updates a single resume', async () => {
    expect((await api.getResume()).data).toBeNull()
    expect((await api.saveResume('too short')).error?.code).toBe('RESUME_TOO_SHORT')
    const first = (await api.saveResume('x'.repeat(60))).data!
    const second = (await api.saveResume('y'.repeat(60))).data!
    expect(second.id).toBe(first.id)
    expect((await api.getResume()).data?.content).toBe('y'.repeat(60))
  })

  it('reports AI as unavailable in demo mode', async () => {
    expect((await api.parseJobPosting({ text: 'x' })).error?.code).toBe('AI_UNAVAILABLE_IN_DEMO')
    expect((await api.analyzeFit('x')).error?.code).toBe('AI_UNAVAILABLE_IN_DEMO')
  })

  it('enforces the per-user application cap', async () => {
    const existing = Array.from({ length: DEMO_MAX_APPLICATIONS }, (_, i) => ({
      id: String(i),
      company: 'A',
      role: 'B',
      history: [],
    }))
    localStorage.setItem('job-tracker:applications:v1', JSON.stringify(existing))
    expect((await api.createApplication(input)).error?.code).toBe('APPLICATION_LIMIT')
    expect((await api.getUsage()).data?.applications).toBe(DEMO_MAX_APPLICATIONS)
  })
})
