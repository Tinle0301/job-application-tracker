import { describe, expect, it } from 'vitest'
import { mergeParsed } from './mergeParsed'

const job = {
  company: 'Acme',
  role: 'SWE',
  location: 'Remote',
  salary: '$100K',
  employmentType: 'Full-time',
  requirements: ['React', 'SQL'],
  summary: 'Build things.',
  description: 'JD text',
}
const empty = { company: '', role: '', location: '', salary: '', url: '', jobDescription: '', notes: '' }

describe('mergeParsed', () => {
  it('fills empty fields and builds notes from type, summary and requirements', () => {
    const out = mergeParsed(empty, job, 'https://x.dev/j')
    expect(out).toMatchObject({ company: 'Acme', url: 'https://x.dev/j', jobDescription: 'JD text' })
    expect(out.notes).toBe('Full-time\n\nBuild things.\n\nKey requirements:\n- React\n- SQL')
  })

  it('never overwrites what the user typed', () => {
    const out = mergeParsed({ ...empty, company: 'Mine', notes: 'my notes' }, job)
    expect(out.company).toBe('Mine')
    expect(out.notes).toBe('my notes')
  })
})
