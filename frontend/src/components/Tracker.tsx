import { useEffect, useMemo, useState } from 'react'
import type { Application, ApplicationInput } from '@backend/models/types'
import type { TrackerApi } from '@backend/services/api'
import { useApplications } from '../hooks/useApplications'
import { applyFilters, DEFAULT_FILTERS } from '../lib/filters'
import { exportJson, parseImport } from '../lib/importExport'
import { findApplicationForPage, readPageImport } from '../lib/pageImport'
import { StatsBar } from './StatsBar'
import { Toolbar } from './Toolbar'
import { ApplicationTable } from './ApplicationTable'
import { ApplicationForm } from './ApplicationForm'
import { ResumePanel } from './ResumePanel'
import { UsageMeter } from './UsageMeter'
import { EmailSync } from './EmailSync'

type Tab = 'applications' | 'resume'

interface Props {
  api: TrackerApi
  userEmail?: string
  onSignOut?: () => void
}

export function Tracker({ api, userEmail, onSignOut }: Props) {
  const { apps, revision, loading, error, create, update, updateStatus, remove, importMany, setAnalysis, reload } =
    useApplications(api)
  const [tab, setTab] = useState<Tab>('applications')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [editing, setEditing] = useState<Application | 'new' | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<Partial<ApplicationInput>>()
  // A job page sent by the "Save job description" bookmark.
  const [pageImport, setPageImport] = useState(() => readPageImport(window.location.hash))

  useEffect(() => {
    if (window.location.hash.startsWith('#jd=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])
  // Once the list is loaded, open the matching application (or a new one) with the description filled in.
  if (pageImport && !loading) {
    const app = findApplicationForPage(apps, pageImport.url)
    setPageImport(null)
    setPrefill(app ? { jobDescription: pageImport.text } : { url: pageImport.url, jobDescription: pageImport.text })
    setEditing(app ?? 'new')
  }

  const closeForm = () => {
    setEditing(null)
    setPrefill(undefined)
  }

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
            {api.mode === 'demo' ? 'Demo mode: data is saved in this browser.' : `Signed in as ${userEmail}`}
          </p>
        </div>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            Sign out
          </button>
        )}
      </header>

      {api.aiEnabled && (
        <nav className="flex gap-1 border-b border-stone-200" aria-label="Sections">
          {(['applications', 'resume'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
                tab === t ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      )}

      {api.aiEnabled && tab === 'resume' ? (
        <ResumePanel api={api} />
      ) : (
        <>
          <StatsBar apps={apps} />
          <UsageMeter api={api} version={revision} />
          {api.emailSyncEnabled && <EmailSync api={api} apps={apps} onStatusesChanged={reload} />}
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
              api={api}
              apps={visible}
              onAnalyzed={setAnalysis}
              onStatusChange={updateStatus}
              onEdit={(app) => setEditing(app)}
              onDelete={(app) => {
                if (window.confirm(`Delete ${app.role} at ${app.company}?`)) remove(app.id)
              }}
            />
          )}
        </>
      )}

      {editing && (
        <ApplicationForm
          api={api}
          initial={editing === 'new' ? undefined : editing}
          prefill={prefill}
          onCancel={closeForm}
          onSubmit={async (input) => {
            const saved = editing === 'new' ? await create(input) : await update(editing.id, input)
            if (saved) closeForm()
          }}
        />
      )}
    </div>
  )
}
