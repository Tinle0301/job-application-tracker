import type { Application, ApplicationInput } from '@backend/models/types'
import { STATUSES } from '@backend/models/types'

export function exportJson(apps: Application[]): string {
  return JSON.stringify(apps, null, 2)
}

/** Parses and validates an imported JSON array, keeping only known fields. */
export function parseImport(text: string): ApplicationInput[] {
  const data: unknown = JSON.parse(text)
  if (!Array.isArray(data)) throw new Error('Expected a JSON array of applications')
  return data.map((raw, i) => {
    const r = raw as Record<string, unknown>
    const company = String(r.company ?? '').trim()
    const role = String(r.role ?? '').trim()
    if (!company || !role) throw new Error(`Row ${i + 1}: company and role are required`)
    const status = STATUSES.includes(r.status as never) ? (r.status as ApplicationInput['status']) : 'applied'
    return {
      company,
      role,
      location: String(r.location ?? ''),
      url: String(r.url ?? ''),
      status,
      appliedOn: r.appliedOn ? String(r.appliedOn) : null,
      salary: String(r.salary ?? ''),
      notes: String(r.notes ?? ''),
      jobDescription: String(r.jobDescription ?? ''),
    }
  })
}
