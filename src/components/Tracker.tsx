import { useMemo, useState } from 'react'
import type { Application } from '../types'
import type { ApplicationRepository } from '../lib/repository'
import { useApplications } from '../hooks/useApplications'
import { applyFilters, DEFAULT_FILTERS } from '../lib/filters'
import { exportJson, parseImport } from '../lib/importExport'
import { StatsBar } from './StatsBar'
import { Toolbar } from './Toolbar'
import { ApplicationTable } from './ApplicationTable'
import { ApplicationForm } from './ApplicationForm'

interface Props {
  repo: ApplicationRepository
  userEmail?: string
  onSignOut?: () => void
}

export function Tracker({ repo, userEmail, onSignOut }: Props) {
  const { apps, loading, error, create, update, updateStatus, remove, importMany } = useApplications(repo)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [editing, setEditing] = useState<Application | 'new' | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const visible = useMemo(() => applyFilters(apps, filters), [apps, filters])

  const handleImport = async (file: File) => {
    try {
      setImportError(null)
      await importMany(parseImport(await file.text()))
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
    }
  }

  const handleExport = () => {
    const blob = new Blob([exportJson(apps)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `applications-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Job Application Tracker</h1>
          <p className="text-sm text-stone-500">
            {repo.kind === 'local' ? 'Demo mode: data is saved in this browser.' : `Signed in as ${userEmail}`}
          </p>
        </div>
        {onSignOut && (
          <button onClick={onSignOut} className="text-sm text-stone-600 hover:text-stone-900">
            Sign out
          </button>
        )}
      </header>

      <StatsBar apps={apps} />
      <Toolbar
        filters={filters}
        onChange={setFilters}
        onAdd={() => setEditing('new')}
        onImport={handleImport}
        onExport={handleExport}
      />

      {(error || importError) && (
        <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {error ?? importError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : (
        <ApplicationTable
          apps={visible}
          onStatusChange={updateStatus}
          onEdit={(app) => setEditing(app)}
          onDelete={(app) => {
            if (window.confirm(`Delete ${app.role} at ${app.company}?`)) remove(app.id)
          }}
        />
      )}

      {editing && (
        <ApplicationForm
          initial={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSubmit={async (input) => {
            if (editing === 'new') await create(input)
            else await update(editing.id, input)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
