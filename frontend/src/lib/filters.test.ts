import { describe, expect, it } from 'vitest'
import { applyFilters, DEFAULT_FILTERS } from './filters'
import type { Application } from '@backend/models/types'

const base = {
  location: '',
  url: '',
  salary: '',
  notes: '',
  jobDescription: '',
  latestAnalysis: null,
  history: [],
  createdAt: '',
}
const apps: Application[] = [
  {
    ...base,
    id: '1',
    company: 'NVIDIA',
    role: 'Systems SWE',
    status: 'applied',
    appliedOn: '2026-10-06',
    updatedAt: '2026-10-06',
  },
  {
    ...base,
    id: '2',
    company: 'Affirm',
    role: 'Analyst',
    status: 'interviewing',
    appliedOn: '2026-10-07',
    updatedAt: '2026-10-08',
  },
  {
    ...base,
    id: '3',
    company: 'Canonical',
    role: 'Junior PM',
    status: 'rejected',
    appliedOn: '2026-10-05',
    updatedAt: '2026-10-07',
  },
]

describe('applyFilters', () => {
  it('sorts by most recently updated by default', () => {
    expect(applyFilters(apps, DEFAULT_FILTERS).map((a) => a.id)).toEqual(['2', '3', '1'])
  })

  it('filters by status', () => {
    expect(applyFilters(apps, { ...DEFAULT_FILTERS, status: 'rejected' })).toHaveLength(1)
  })

  it('searches case-insensitively across company and role', () => {
    expect(applyFilters(apps, { ...DEFAULT_FILTERS, query: 'analyst' }).map((a) => a.company)).toEqual(['Affirm'])
  })

  it('sorts alphabetically by company', () => {
    expect(applyFilters(apps, { ...DEFAULT_FILTERS, sort: 'company' }).map((a) => a.company)).toEqual([
      'Affirm',
      'Canonical',
      'NVIDIA',
    ])
  })
})
