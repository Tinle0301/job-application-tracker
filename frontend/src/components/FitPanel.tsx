import { useState } from 'react'
import type { Application, FitAnalysis } from '@backend/models/types'
import type { TrackerApi } from '@backend/services/api'
import { fitTone } from '../lib/fit'

interface Props {
  app: Application
  api: TrackerApi
  onAnalyzed: (analysis: FitAnalysis) => void
}

/** "Analyze fit": scores the saved resume against this job's description. */
export function FitPanel({ app, api, onAnalyzed }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const a = app.latestAnalysis
  const hasJd = app.jobDescription.trim().length >= 100

  const analyze = async () => {
    setBusy(true)
    setError(null)
    const res = await api.analyzeFit(app.id)
    setBusy(false)
    if (res.error) setError(res.error.message)
    else onAnalyzed(res.data)
  }

  return (
    <section aria-label="Resume match" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Resume match (AI)</h4>
        <button
          onClick={analyze}
          disabled={busy || !hasJd}
          title={hasJd ? undefined : 'Add the job description first (Edit)'}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-stone-100 disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : a ? 'Re-analyze' : 'Analyze fit'}
        </button>
      </div>
      {!hasJd && !a && (
        <p className="text-xs text-stone-500">Add the job description to this application to analyze fit.</p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
          {error}
        </p>
      )}
      {a && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <span
              className={`rounded-xl px-3 py-1 text-2xl font-semibold tabular-nums ring-1 ring-inset ${fitTone(a.score)}`}
            >
              {a.score}
            </span>
            <p className="text-stone-700">{a.summary}</p>
          </div>
          <SkillList title="Matched" items={a.matchedSkills} tone="text-emerald-700" />
          <SkillList title="Missing" items={a.missingSkills} tone="text-rose-700" />
          {a.suggestions.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-stone-500">Suggestions</h5>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-stone-700">
                {a.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-stone-400">
            {a.model} · {new Date(a.createdAt).toLocaleString()} · AI output can be wrong; review before acting on it.
          </p>
        </div>
      )}
    </section>
  )
}

function SkillList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null
  return (
    <div>
      <h5 className="text-xs font-medium text-stone-500">{title}</h5>
      <ul className={`mt-1 flex flex-wrap gap-1.5 ${tone}`}>
        {items.map((s) => (
          <li key={s} className="rounded-md bg-white px-2 py-0.5 text-xs ring-1 ring-stone-200">
            {s}
          </li>
        ))}
      </ul>
    </div>
  )
}
