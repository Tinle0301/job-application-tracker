import { useState } from 'react'
import type { ParsedJob } from '@backend/models/types'
import type { TrackerApi } from '@backend/services/api'

/** "Paste job posting → auto-fill": sends text or a URL to the parse-job function. */
export function AutoFill({ api, onParsed }: { api: TrackerApi; onParsed: (job: ParsedJob) => void }) {
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    const value = source.trim()
    const isUrl = /^https?:\/\/\S+$/i.test(value)
    setBusy(true)
    setError(null)
    const res = await api.parseJobPosting(isUrl ? { url: value } : { text: value })
    setBusy(false)
    if (res.error) setError(res.error.message)
    else {
      onParsed(res.data)
      setSource('')
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      <label className="block text-sm font-medium text-violet-900">
        Auto-fill with AI
        <textarea
          rows={3}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Paste the job posting text, or its URL"
          className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-violet-900/70">Fills company, role, location, salary and the job description.</p>
        <button
          type="button"
          onClick={run}
          disabled={busy || !source.trim()}
          className="shrink-0 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-600 disabled:opacity-50"
        >
          {busy ? 'Reading…' : 'Auto-fill'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}
