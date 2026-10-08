import { describe, expect, it } from 'vitest'
import { computeStats, formatPercent } from './stats'
import type { Application, Status } from '../types'

function app(status: Status, history: Status[] = [status]): Application {
  return {
    id: Math.random().toString(),
    company: 'Acme',
    role: 'Engineer',
    location: '',
    url: '',
    status,
    appliedOn: '2026-10-01',
    salary: '',
    notes: '',
    history: history.map((s, i) => ({ status: s, changedAt: `2026-10-0${i + 1}T00:00:00Z` })),
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

describe('computeStats', () => {
  it('returns zeros for an empty list', () => {
    const s = computeStats([])
    expect(s.total).toBe(0)
    expect(s.responseRate).toBe(0)
    expect(s.interviewRate).toBe(0)
  })

  it('excludes wishlist items from submitted count', () => {
    const s = computeStats([app('wishlist'), app('applied'), app('applied')])
    expect(s.total).toBe(3)
    expect(s.submitted).toBe(2)
  })

  it('counts a rejection after an interview as both a response and an interview', () => {
    const s = computeStats([app('rejected', ['applied', 'interviewing', 'rejected']), app('applied')])
    expect(s.responseRate).toBe(0.5)
    expect(s.interviewRate).toBe(0.5)
    expect(s.byStatus.rejected).toBe(1)
  })
})

describe('formatPercent', () => {
  it('rounds to a whole percent', () => {
    expect(formatPercent(0.3333)).toBe('33%')
  })
})
