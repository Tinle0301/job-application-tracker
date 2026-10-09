import type { ParsedJob } from '@backend/models/types'

/** Merges parsed fields into the form without overwriting what the user already typed. */
export function mergeParsed<
  T extends {
    company: string
    role: string
    location: string
    salary: string
    url: string
    jobDescription: string
    notes: string
  },
>(form: T, job: ParsedJob, sourceUrl?: string): T {
  const keep = (current: string, next: string) => (current.trim() ? current : next)
  const reqs = job.requirements.length ? `Key requirements:\n${job.requirements.map((r) => `- ${r}`).join('\n')}` : ''
  return {
    ...form,
    company: keep(form.company, job.company),
    role: keep(form.role, job.role),
    location: keep(form.location, job.location),
    salary: keep(form.salary, job.salary),
    url: keep(form.url, sourceUrl ?? ''),
    jobDescription: keep(form.jobDescription, job.description),
    notes: keep(form.notes, [job.employmentType, job.summary, reqs].filter(Boolean).join('\n\n')),
  }
}
