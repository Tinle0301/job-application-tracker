import { STATUSES } from '@backend/models/types'
import { STATUS_LABELS } from '../lib/statuses'
import type { FilterState, SortKey } from '../lib/filters'

interface Props {
  filters: FilterState
  onChange: (f: FilterState) => void
  onAdd: () => void
  onImport: (file: File) => void
  onExport: () => void
}

export function Toolbar({ filters, onChange, onAdd, onImport, onExport }: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <input
        type="search"
        placeholder="Search company, role, notes…"
        aria-label="Search applications"
        value={filters.query}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm md:max-w-xs"
      />
      <select
        aria-label="Filter by status"
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value as FilterState['status'] })}
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
      >
        <option value="all">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <select
        aria-label="Sort by"
        value={filters.sort}
        onChange={(e) => onChange({ ...filters, sort: e.target.value as SortKey })}
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
      >
        <option value="updated">Recently updated</option>
        <option value="applied">Date applied</option>
        <option value="company">Company A–Z</option>
      </select>
      <div className="flex gap-2 md:ml-auto">
        <label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-100">
          Import
          <input
            type="file"
            accept="application/json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImport(file)
              e.target.value = ''
            }}
          />
        </label>
        <button
          onClick={onExport}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-100"
        >
          Export
        </button>
        <button
          onClick={onAdd}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          + Add application
        </button>
      </div>
    </div>
  )
}
