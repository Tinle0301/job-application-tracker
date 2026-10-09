import type { Application, Status } from '@backend/models/types'

export type SortKey = 'updated' | 'applied' | 'company'

export interface FilterState {
  query: string
  status: Status | 'all'
  sort: SortKey
}

export const DEFAULT_FILTERS: FilterState = { query: '', status: 'all', sort: 'updated' }

export function applyFilters(apps: Application[], f: FilterState): Application[] {
  const q = f.query.trim().toLowerCase()
  const filtered = apps.filter((a) => {
    if (f.status !== 'all' && a.status !== f.status) return false
    if (!q) return true
    return [a.company, a.role, a.location, a.notes].some((v) => v.toLowerCase().includes(q))
  })

  const sorted = [...filtered]
  switch (f.sort) {
    case 'company':
      sorted.sort((a, b) => a.company.localeCompare(b.company))
      break
    case 'applied':
      sorted.sort((a, b) => (b.appliedOn ?? '').localeCompare(a.appliedOn ?? ''))
      break
    default:
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  return sorted
}
